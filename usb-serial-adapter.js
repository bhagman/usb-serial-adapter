/*
|| USBSerialAdapter
|| Oryng Wiring (aka Arduino) Framework PackedSerial Adapter.
|| Allows lightweight devices, such as Arduino UNO, to communicate with a Thing gateway
|| over a USB serial port.
||
|| More notes at the bottom.
*/

'use strict';

let LOCALTESTING = require('./testing/testing');

let Adapter, Database;

if (LOCALTESTING == true) {
  Adapter = require('./testing/adapter');
  // Database not needed (only used in loadAdapter)
} else {
  const gwa = require('gateway-addon');
  Adapter = gwa.Adapter;
  Database = gwa.Database;
}
//const {
//  Adapter,
//  Database
//} = require('gateway-addon');

const SerialPort = require('serialport');  // Need for serial port enumeration

const USBSerialBoard = require('./usb-serial-board');

// TODO: We fix the bitrate for all ports for now
const THINGBITRATE = 115200;


class USBSerialAdapter extends Adapter {
  // Unlike the ZWave adapter addon, we use a single instance of the
  // USBSerialAdapter to manage all serial ports.
  // The upshot of this is that we can dynamically manage serial ports
  // as the user may add/remove them during normal operation.
  // If we used multiple adapter instances, we wouldn't know who is
  // managing what port, and the only way to enumerate new ports
  // effectively would be through the loadAdapter function offered to
  // the addon manager.
  // In addition, there would be no way to self-unload an adapter.

  // TODO: allow selection of enumerated ports, by injecting them into the manifest/db for configuration
  constructor(addonManager, manifest) {
    super(addonManager, 'USBSerialAdapter', manifest.name);
    this.boards = {};
    this.manifest = manifest;
    addonManager.addAdapter(this);
    this.startPairing();
  }

  addBoard(comName, board) {
    this.boards[comName] = board;
  }

  handleDeviceAdded(newThing) {
    super.handleDeviceAdded(newThing);
    newThing.board.addDevice(newThing.id);
  }

  handleDeviceRemoved(thing) {
    thing.board.removeDevice(thing.id);
    super.handleDeviceRemoved(thing);
  }

  pruneDisconnectedBoards() {
    for (let boardId in this.boards) {
      if (this.boards[boardId].connected == false) {
        // Now remove the board
        this.boards[boardId].disconnect();
        console.log('Removing', this.boards[boardId].id);
        delete this.boards[boardId];
      }
    }
  }

  dumpBoards(descend) {
    for (let boardId in this.boards) {
      let board = this.boards[boardId];
      console.log('Board:', board.id,
                  '|name:', board.name,
                  '|connected:', board.connected,
                  '|ThingCount:', board.deviceIds.length);
      if (descend == true) {
        this.dumpDevices(board, '-- ', true);
      }
    }
  }

  dumpDevices(board, indent, descend) {
    if (!indent) {
      indent = '';
    }

    for (let i = 0; i < board.deviceIds.length; i++) {
      let thing = this.getDevice(board.deviceIds[i]);

      console.log(indent + 'Thing:', thing.id,
                  '|name:', thing.name,
                  '|type:', thing.type,
                  '|description:', thing.description,
                  '|propertyCount:', thing.properties.size);
      if (descend == true) {
        this.dumpProperties(thing, '---- ');
        // this.dumpEvents(thing);
        // this.dumpActions(thing);
      }
    }
  }

  dumpProperties(thing, indent) {
    if (!indent) {
      indent = '';
    }

    // thing.properties is a Map.
    for (let property of thing.properties.values()) {
      console.log(indent + 'Property:', property.name,
                  '|type:', property.type,
                  '|description:', property.description,
                  '|value:', property.value);
    }
  }

  serialPortMatches(port, portSelectors) {
    // We only filter using keys from the following:
    const compareKeys = ['manufacturer',
                        'vendorId',
                        'productId',
                        'serialNumber',
                        'comName'];

    // Under OSX, SerialPort.list returns the /dev/tty.usbXXX instead
    // /dev/cu.usbXXX. tty.usbXXX requires DCD to be asserted which
    // isn't necessarily the case for usb-to-serial dongles.
    // The cu.usbXXX doesn't care about DCD.
    if (port.comName.startsWith('/dev/tty.usb')) {
      port.comName = port.comName.replace('/dev/tty', '/dev/cu');
    }

    for (const portSelector of portSelectors) {

      if (!portSelector.use) {
        // Don't use this selector
        continue;
      }

      const keysToCompare = Object.keys(portSelector)
                                  .filter(key => compareKeys.indexOf(key) >= 0);
      if (keysToCompare.length == 0) {
        // No keys to use
        continue;
      }

      let match = true;
      for (const keyToCompare of keysToCompare) {
        let configVal = portSelector[keyToCompare];
        let portVal = port[keyToCompare];
        if (typeof(portVal) != 'string' || !portVal.startsWith(configVal)) {
          match = false;
          break; // bail if one of the keys don't match
        }
      }

      if (match) {
        // All of the fields from the config match the values from the port,
        // so we have a match;

        // If there is a baudRate, copy it over
        if (portSelector.hasOwnProperty('baudRate')) {
          port.baudRate = portSelector.baudRate;
        } else {
          port.baudRate = THINGBITRATE;
        }
        return true;
      }
    }
    return false;
  }

  // During the pairing process, check all the ports to see what is available.
  // Thoughts:
  // Pairing should only check ports from config that are NOT open, or ports that
  // are open AND in our device list.
  // The idea is that an open port is already being used (either this adapter, or
  // another).
  // I believe that devices can dynamically change (i.e. add properties, or add
  // entire new devices altogether).
  // 1) Check ports that are in our config that are NOT open.
  // 2) Check ports that are in our config and are open, but only devices
  //    that are not already paired.
  // Question: Is it possible to be paired to more than one "adapter"?
  //
  // There currently is no mechanism to pair devices individually.
  // startPairing will simply add all devices to the adapter, making them
  // available for addition to the UI by the gateway.  There is no way
  // for the UI to signal that the device has been added, and hence, start
  // to act because it's been added.
  //
  // TODO: Without completely understanding what cancelPairing() is trying to achieve,
  // A guess would be that for addons that take a long time to pair devices with the
  // gateway/manager, there needs to be a way to interrupt the pairing process.
  // In our case, there is a possibility that pairing can take some time, and as such,
  // we need a way to use the signal from cancelPairing to interrupt our enumeration of
  // boards & things.
  //
  // TODO: use timeoutSeconds to kill off any boards which don't respond
  // idea? set a timer that calls a function to remove boards that haven't responded.
  // - add "responded" property to 
  //
  startPairing(timeoutSeconds) {
    let promise;
    var myself = this;

    console.log(this.name, 'pairing started. Checking for new boards...');

    // Start timer to remove boards that don't respond
    //var that = this;
    //setTimeout(function () { that.cancelPairing(); }, 2000);  // TODO: Configurable time to start?

    // Go through all the ports in the config, and instantiate a
    // USBSerialBoard for each one.

    // TODO: test - dynamically get port list using selectors from config
    /*
    const db = new Database(this.manifest.name);

    promise = db.open()
      .then(() => {
        return db.loadConfig();
      })
      .then((config) => {
        this.manifest.moziot.config.portSelectors = config.portSelectors;
      });
    */

    // First, go through all of our boards, and prune boards that have been
    // disconnected.
    this.pruneDisconnectedBoards();

    // For each port/board, create a new instance of USBSerialBoard
//    promise.then(() => {
      // using the portSelectors, get a list of ports
      // Don't duplicate -- if a board is already open, don't add it
      let portSelectors = this.manifest.moziot.config.portSelectors;

      SerialPort.list().then(ports => {
        let matchingPorts =
          ports.filter(port => this.serialPortMatches(port, portSelectors));
        if (matchingPorts.length == 0) {
          console.log('No matching serial port found');
          return;
        }

        // Now that we have a list of matching ports, go through them and
        // create new USBSerialBoards for each (or pass over if already exists).
        for (const port of matchingPorts) {
          // First, sanitize the boardId -- only want the filename part of the path
          let boardId = port.comName.split('\\').pop().split('/').pop();

          if (!this.boards[boardId]) {
            // we don't have this board yet
            console.log('adding board:',boardId);
            this.boards[boardId] = new USBSerialBoard(this, boardId, port);
            this.boards[boardId].open();
          }
          else {
            // we have this board, let's enumerate again
            this.boards[boardId].enumerateThings();
          }
        }
      }).catch(e => {
        console.log('Error:',e);
      });
//    });
  }

  cancelPairing() {
    this.pruneDisconnectedBoards();
    super.cancelPairing();
  }

  // removeThing(thing) -- Inherited
  removeThing(device) {
    // Do nothing?
    // The boards handle removal directly upon disconnect, so there is nothing to do here
    this.handleDeviceRemoved(device);
  }

  // cancelRemoveThing(thing) -- Inherited, doesn't do anything anyway

  unload() {
    for (let boardId in this.boards) {
      this.boards[boardId].disconnect();
      console.log('Removing', this.boards[boardId].id);
      delete this.boards[boardId];
    }

    return super.unload();
  }
}

function loadUSBSerialAdapter(addonManager, manifest, _errorCallback) {
  new USBSerialAdapter(addonManager, manifest);
  console.log("usb-serial-adapter loaded.");
}

if (LOCALTESTING == true) {
  module.exports = USBSerialAdapter;
} else {
  module.exports = loadUSBSerialAdapter;
}


/*
||
|| @author         Brett Hagman <bhagman@roguerobotics.com>
|| @url            http://roguerobotics.com/
|| @url            http://oryng.org/
|| @contribution   Dave Hylands <github:dhylands>
|| @contribution   Alexander Brevig <https://alexanderbrevig.com/>
||
|| @description
|| | PackedSerialThingAdapter Addon for Thing Gateway
|| | https://iot.mozilla.org/
|| |
|| #
||
|| @notes
|| |
|| |
|| #
||
|| @todo
|| |
|| | - Change thing "name" from ID -- used for debugging
|| | - board - handle errors in communication (e.g. packet errors, unpacking errors, etc)
|| | - package.json
|| |  - use the definitions in schema to dynamically provide available ports.
|| | - Add to Thing Name for easier ident in "add thing" UI?
|| |
|| #
||
|| @license Please see LICENSE.
||
*/

