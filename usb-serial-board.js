/*
|| USBSerialBoard
|| A class to manage individual boards, connected through a USB Serial port.
||
|| More notes at the bottom.
*/

'use strict';

const SHOW_RX_DATA = false;
const SHOW_TX_DATA = false;

const SerialPort = require('serialport');
const Delimiter = SerialPort.parsers.Delimiter;
const cobs = require('cobs');

const SimplePack = require('./SimplePack.js'); // Consider moving to objpack?

const USBSerialThing = require('./usb-serial-device.js');
const USBSerialLookup = require('./usb-serial-lookup.js');

const requestValueLookup = USBSerialLookup.requestValueLookup;
const responseNameLookup = USBSerialLookup.responseNameLookup;
const responseValueLookup = USBSerialLookup.responseValueLookup;
const thingTypeLookup = USBSerialLookup.thingTypeLookup;
const propertyTypeLookup = USBSerialLookup.propertyTypeLookup;
const propertyValueConversion = USBSerialLookup.propertyValueConversion;

// TODO: We fix the bitrate for all ports for now
const THINGBITRATE = 115200;


class USBSerialBoard {
  // This class manages individual boards connected to the gateway
  // through a particular serial port.  We key on the port name (i.e. boardId = port name)
  constructor(adapter, boardId, port)
  {
    this.id = boardId;
    this.name = "unknown-" + boardId;
    this.adapter = adapter;
    this.port = port;
    this.connected = false;
    this.deviceIds = [];

    this.serialport = new SerialPort(port.comName, {
      baudRate: port.baudRate,
      autoOpen: false
    });

    // Set the serialport parser to call data handler on COBS terminator (0x00)
    this.parser = this.serialport.pipe(new Delimiter({ delimiter: '\0' }));

    // Simply decode using COBS and send to handler
    this.parser.on('data', data => { this.onData(cobs.decode(data)); } );
  }

  enumerateThings() {
    var that = this;
    setTimeout(function () { that.onOpen(); }, 2000);  // TODO: Configurable time to start?
  }

  /**
   * @
   */
  open() {
    var myself = this;

    this.serialport.on('close', function (err) {
      console.log(myself.name, 'disconnected.', err ? err.name + ': ' + err.message : '');
      myself.connected = false;
    });

    this.serialport.open(err => {
      if (err) {
        console.error(this.name, 'Unable to open serial port', this.port.comName);
        console.error(err);
        return;
      }
      console.log(this.name, 'Opened serial port', this.port.comName);
      // Wait some time before starting up (bootloaders, etc...)
      // The other option was to use the 'on' hook in serialport, however, most Arduino/Oryng boards
      // have a bootloader timeout of usually less than 3 seconds.  Most are less than 2 seconds.
      //var that = this;
      //setTimeout(function () { that.onOpen(); }, 2000);  // TODO: Configurable time to start?
      this.enumerateThings();
    });
  }

  disconnect() {
    // first, remove any remaining enumerated things
    for (let i = 0; i < this.deviceIds.length; i++) {
      // Remove all things from the adapter
      let thing = this.adapter.getDevice(this.deviceIds[i]);
      this.adapter.handleDeviceRemoved(thing);
    }

    this.connected = false;
    if (this.serialport.isOpen) {
      this.serialport.close();
    }
  }

  addDevice(newThingId) {
    this.deviceIds.push(newThingId);
  }

  removeDevice(thingId) {
    // Make sure it is in our list
    let index = this.deviceIds.indexOf(thingId);
    if (index > -1) {
      this.deviceIds.splice(index, 1);
    }
  }

  dumpDevices() {
    console.log('dumping devices for', this.name);
    for (let i = 0; i < this.deviceIds.length; i++) {
      let device = this.adapter.getDevice(this.deviceIds[i]);

      console.log('Thing:', device.id,
                  '|name:', device.name,
                  '|type:', device.type,
                  '|description:', device.description,
                  '|propertyCount:', device.properties.size);
    }
  }

  onDetailAdapter(data) {
    // DefineAdapter response:
    //  0 - uint8  - DETAILADAPTER
    //  1 - string - adapterName
    //  2 - string - adapterDescription
    //  3 - uint8  - thingCount

    let simplePack = new SimplePack(['uint8', 'string', 'string', 'uint8']);
    let responseValues = simplePack.unpack(data);

    this.name = responseValues[1] + "-" + this.id; // update name
    this.description = responseValues[2];
    this.defineThingCount = responseValues[3];

    console.log(this.name, 'details --',
                'description:', this.description,
                '|thingCount:', this.defineThingCount);

    // Prepare to index Things
    this.defineThingIndex = 0;
    this.send('defineThingByIdx', {
      thingIndex: 0
    });
  }

  onDetailThing(data) {
    // DefineThingByIdx response:
    //  0 - uint8  - DETAILTHINGBYIDX
    //  1 - uint8  - thingIdx
    //  2 - uint8  - thingType
    //  3 - string - thingName
    //  4 - string - thingDescription
    //  5 - uint8  - propertyCount
    //  6 - uint8  - eventCount
    //  7 - uint8  - actionCount

    // Indicate that we got a good response, and that this is likely a valid board.
    this.connected = true;

    let simplePack = new SimplePack(['uint8', 'uint8', 'uint8', 'string', 'string', 'uint8', 'uint8', 'uint8']);
    let responseValues = simplePack.unpack(data);

    let msgData = { "index": responseValues[1],
                    "id": this.name + "-" + responseValues[1], // we use the index to keep things unique
                    "type": thingTypeLookup(responseValues[2]),
//                    "name": responseValues[3],
                    "name": this.name + "-" + responseValues[1],
                    "description": responseValues[4],
                    "propertyCount": responseValues[5],
                    "eventCount" : responseValues[6],
                    "actionCount" : responseValues[7] };

    // Build up a new Thing
    this.newThing = new USBSerialThing(this, msgData);
    this.newThing.index = msgData.index;
    this.newThing.type = msgData.type;
    this.definePropertyCount = msgData.propertyCount;

    console.log(this.name,
                'Thing:', msgData.name,
                '|id:', msgData.id,
                '|type:', msgData.type,
                '|description:', msgData.description,
                '|propertyCount:', msgData.propertyCount);

    this.definePropertyIndex = 0;
    this.send('definePropertyByIdx', {
      thingIndex: this.defineThingIndex,
      propertyIndex: 0
    });
  }

  onDetailThingPropertiesDone() {
    // All properties have been indexed for this thing.  We can turn the thing on now.
    console.log(this.name, this.newThing.id, 'communication starting.')
    this.send('pair', { thingIndex: this.defineThingIndex });
  }

  onDetailThingDone() {
    // OK, so we have all the properties for this Thing.
    // Add it to the Adapter, then define the next one, if there is one.
    // TODO: Check it it matches what is already in the Adapter.
    if (!(this.newThing.id in this.adapter.devices)) {
      this.adapter.handleDeviceAdded(this.newThing);
    }
    this.newThing = null;

    this.defineThingIndex += 1;
    if (this.defineThingIndex < this.defineThingCount) {
      this.send('defineThingByIdx', {
        thingIndex: this.defineThingIndex
      });
    }
    else {
      console.log(this.name, 'Thing indexing complete:', this.defineThingCount, this.defineThingCount == 1 ? 'thing' : 'things');
      // All Things indexed
    }
  }

  onDetailProperty(data) {
    // DefinePropertyByIdx response:
    //  0 - uint8  - DETAILPROPERTYBYIDX
    //  1 - uint8  - thingIdx
    //  2 - uint8  - propertyIdx
    //  3 - uint8  - propertyType
    //  4 - string - propertyName
    //  5 - string - propertyDescription
    //  6 - x      - value

    let simplePack = new SimplePack(['uint8', 'uint8', 'uint8', 'uint8', 'string', 'string']); // final field requires lookup
    let responseValues = simplePack.unpack(data);
    let valueType = '';

    switch(propertyTypeLookup(responseValues[3]))
    {
      case 'boolean':
        valueType = 'uint8';
        break;
      case 'number':
        valueType = 'int32'; // TODO: make sure this jives with U32 sent
        break;
      case 'string':
        valueType = 'string';
        break;
      default:
        // TODO: bail on unknown type
        break;
    }
    simplePack.types.push(valueType); // add the data type to the end
    responseValues = simplePack.unpack(data);

    let msgData = { "index": responseValues[2],
                    "id": responseValues[2],  // Same as index, for now
                    "type": propertyTypeLookup(responseValues[3]),
                    "name": responseValues[4],
                    "description": responseValues[5],
                    "value": propertyValueConversion(responseValues[3], responseValues[6]) };


    console.log(this.name,
                'Property:', msgData.name,
                '|id:', msgData.id,  // Same as index, for now
                '|type:', msgData.type,
                '|description:', msgData.description,
                '|value:', msgData.value);

    if (this.newThing) {
      // Could also check this.newThing.index or .id against thingIdx from response
      this.newThing.addProperty(msgData);
    }

    this.definePropertyIndex += 1;
    if (this.definePropertyIndex < this.definePropertyCount) {
      this.send('definePropertyByIdx', {
        thingIndex: this.defineThingIndex,
        propertyIndex: this.definePropertyIndex
      });
    } else {
      console.log(this.name, 'Property indexing complete:', this.definePropertyCount, this.definePropertyCount == 1 ? 'property' : 'properties');
      this.onDetailThingPropertiesDone();
    }
  }

  onPropertyStatus(data) {
    //  0 - uint8 - PROPERTYSTATUS
    //  1 - uint8 - thingIdx
    //  2 - uint8 - propertyIdx
    //  3 - x     - value

    let simplePack = new SimplePack(['uint8', 'uint8', 'uint8']); // final field requires lookup
    let responseValues = simplePack.unpack(data);
    let valueType = '';
    let thing = this.getThingByIndex(responseValues[1]);
    let property = this.getPropertyByIndex(responseValues[1], responseValues[2]);

    switch (property.type)
    {
      case 'boolean':
        valueType = 'uint8';
        break;
      case 'number':
        valueType = 'int32'; // TODO: Check that this jives
        break;
      case 'string':
        valueType = 'string';
        break;
      default:
        // TODO: bail on unknown type
        break;
    }
    simplePack.types.push(valueType); // add the data type to the end
    responseValues = simplePack.unpack(data);

    let msgData = { "id": thing.id,
                    "name": property.name,
                    "value": responseValues[3] };  // TODO: value conversion? js type -> constriction?
                 // "value": propertyValueConversion(property.type, responseValues[3]) };

    console.log(this.name, 'PropertyStatus Thing id:', msgData.id, // Same as index, for now
                           '|property name:', msgData.name,
                           '|value:', msgData.value);

    //let thing = this.getDevice(msgData.id);
    if (thing) {
      let property = thing.findProperty(msgData.name);
      if (property) {
        property.setCachedValue(msgData.value);
        thing.notifyPropertyChanged(property);
      } else {
        console.log(this.name, 'propertyChanged for unknown property:', msgData.name,
                    '- ignoring');
      }
    } else {
      console.log(this.name, 'propertyChanged for unknown thing:', msgData.id,
                  '- ignoring');
    }
  }

  /**
   * 
   * @param {number} thingIndex
   * @returns {SerialThing} SerialThing matching thingIndex
   */
  getThingByIndex(thingIndex) {
    let things = this.adapter.getDevices();
    for (let id in things) {
      if (things[id].index == thingIndex && things[id].board.id == this.id) {
        return things[id];
      }
    }
  }

  getPropertyByIndex(thingIndex, propertyIndex) {
    let thing = this.getThingByIndex(thingIndex);

    for (let prop of thing.properties.values()) {
      if (prop.index == propertyIndex) {
        return prop;
      }
    }
  }

  getPropertyTypeByIndex(thingIndex, propertyIndex) {
    // get list of Things from this.getDevices()
    // - then iterate through to find Thing with thingIndex
    // get list of Properties from 
    // TODO: Error checking
    let property = this.getPropertyByIndex(thingIndex, propertyIndex);
    return property.type;
  }

  // TODO: unnecessary?
  // get the property data type from msg
  getPropertyType(id, name) {
    console.log(this.name, 'getPropertyType: id:', id, 'name:', name);

    let thing = this.adapter.getDevice(id);
    if (thing) {
      let property = thing.findProperty(name);
      if (property) {
        return property.type;
      } else {
        console.log(this.name, 'getPropertyType for unknown property:', name, '- ignoring');
      }
    } else {
      console.log(this.name, 'getPropertyType for unknown thing:', id, '- ignoring');
    }
    return 'unknown';
  }

  // TODO: error checking
  onData(data) {
    // Serial data reception
    // Data is received as a frame sent using COBS
    // Data is packed in SimplePack.
    // First byte indicates the response type.

    if (SHOW_RX_DATA)
      console.log(this.name,'got data:', data);

    if (data) {
      let msg = {};

      // parse out the response code (first byte of the response)
      let simplePack = new SimplePack(['uint8']);
      let responseCode = simplePack.unpack(data)[0];

      switch(responseNameLookup(responseCode))
      {
        case 'detailAdapter':
          this.onDetailAdapter(data);
          break;
        case 'detailThingByIdx':
          this.onDetailThing(data);
          break;
        case 'detailPropertyByIdx':
          this.onDetailProperty(data);
          break;
        case 'propertyStatus':
          this.onPropertyStatus(data);
          break;
        case 'paired':
          this.onDetailThingDone(data);
          break;
        case 'unpaired':
          // No use for this, yet?
          break;
        case 'error':
          simplePack.types = ['uint8', 'uint8'];
          let responseValues = simplePack.unpack(data);
          console.error('Error in response:', responseValues[1]);
          break;
        default:
          console.error('Unrecognized response:', responseValues[0]);
          break;
      }
    }
  }

  onOpen() {
    // If we don't get a timely response from 'defineAdapter', we need to drop this connection as this is likely not a board that speaks Thing
    // Temporary solution: since 'defineAdapter' is the first message sent, if we get a response
    // we can assume that this is a valid board, thus, in onDetailAdapter, we can set .connected to true.
    //
    // TODO: Arduino/Oryng Wiring boards will usually reset upon opening of the serial port.  Is there
    // a way to stop DTR (or the like) on the serialport from toggling during connection?
    this.send('defineAdapter');
  }

  send(request, data) {

    if (!data) {
      data = {};
    }

    let simplePack = new SimplePack();
    let values;
    let goodRequest = false;

    switch (request) {
      case 'defineAdapter':
        simplePack.types = [ 'uint8' ];
        values = [ requestValueLookup('defineAdapter') ];
        goodRequest = true;
        break;
      case 'defineThingByIdx':
        simplePack.types = [ 'uint8', 'uint8' ];
        values = [ requestValueLookup('defineThingByIdx'), data.thingIndex ];
        goodRequest = true;
        break;
      case 'definePropertyByIdx':
        simplePack.types = [ 'uint8', 'uint8', 'uint8' ];
        values = [ requestValueLookup('definePropertyByIdx'), data.thingIndex, data.propertyIndex ];
        goodRequest = true;
        break;
      // TODO: add defineEventByIdx and defineActionByIdx
      case 'setProperty':
        let valueType;
        switch(this.getPropertyTypeByIndex(data.thingIndex, data.propertyIndex)) {
          case 'boolean':
            valueType = 'uint8';
            break;
          case 'number':
            valueType = 'int32';  // TODO: Check that this jives
            break;
          case 'string':
            valueType = 'string';
            break;
          default:
            console.error('unknown data type for property:', data.id, '-', data.name);
            break;
        }
        simplePack.types = [ 'uint8', 'uint8', 'uint8', valueType ];
        values = [ requestValueLookup('setProperty'), data.thingIndex, data.propertyIndex, data.value ];

        goodRequest = true;
        break;
      case 'getProperty':
        simplePack.types = [ 'uint8', 'uint8', 'uint8' ];
        values = [ requestValueLookup('getProperty'), data.thingIndex, data.propertyIndex ];

        goodRequest = true;
        break;
      case 'pair':
        simplePack.types = [ 'uint8', 'uint8' ];
        values = [ requestValueLookup('pair'), data.thingIndex ];

        goodRequest = true;
        break;
      case 'unpair':
        simplePack.types = [ 'uint8', 'uint8' ];
        values = [ requestValueLookup('unpair'), data.thingIndex ];

        goodRequest = true;
        break;
      default:
        console.log(this.name, 'unknown request:', request);  // TODO: remove or implement log level
        break;
    }

    if (goodRequest == true) {
      let dataToSend = simplePack.pack(values);
      if (SHOW_TX_DATA)
        console.log(this.name,'sending:', dataToSend);
      this.serialport.write(cobs.encode(dataToSend));
      this.serialport.write([0x00]); // Send COBS terminator
      this.serialport.drain();
    }
  }
}

module.exports = USBSerialBoard;


/*
||
|| @author         Brett Hagman <bhagman@roguerobotics.com>
|| @url            http://roguerobotics.com/
|| @url            http://oryng.org/
|| @contribution   Dave Hylands <github:dhylands>
|| @contribution   Alexander Brevig <https://alexanderbrevig.com/>
||
|| @description
|| | USBSerialBoard
|| |
|| | Requests supported:
|| |  DEFINEADAPTER       = 0x00,
|| |  DEFINETHINGBYIDX    = 0x01,
|| |  DEFINEPROPERTYBYIDX = 0x02,
|| |  DEFINEEVENTBYIDX    = 0x03,
|| |  DEFINEACTIONBYIDX   = 0x04,
|| |  SETPROPERTY         = 0x05,
|| |  GETPROPERTY         = 0x06,
|| |  PAIR                = 0xfd,
|| |  UNPAIR              = 0xfe
|| |
|| | Responses:
|| |  DETAILADAPTER       = 0x00,
|| |  DETAILTHINGBYIDX    = 0x01,
|| |  DETAILPROPERTYBYIDX = 0x02,
|| |  DETAILEVENTBYIDX    = 0x03,
|| |  DETAILACTIONBYIDX   = 0x04,
|| |  PROPERTYSTATUS      = 0x05,
|| |  PAIRED              = 0xfd,
|| |  UNPAIRED            = 0xfe,
|| |  ERROR               = 0xff
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
|| #
||
|| @license Please see LICENSE.
||
*/

