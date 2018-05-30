/*
|| USBSerialDevice
|| A class to manage individual Things - one of many on a board (per USB serial port).
||
|| More notes at the bottom.
*/

// TODO: getProperty() (inherited) needs to check if we are connected, and if not, reject or throw error.

'use strict';

let LOCALTESTING = require('./testing/testing');

let Device;

if (LOCALTESTING == true) {
  Device = require('./testing/device');
} else {
  const gwa = require('gateway-addon');
  Device = gwa.Device;
}
//const {
//  Device
//} = require('gateway-addon');

const USBSerialProperty = require('./usb-serial-property');
const USBSerialBoard = require('./usb-serial-board');

class USBSerialThing extends Device {

  constructor(board, msgData) {
    super(board.adapter, msgData.id);
    this.board = board;  // Our board
    this.index = msgData.index;
    this.name = msgData.name;
    this.type = msgData.type;
    this.description = msgData.description;
  }

  // BEGIN Base class overloads
    /**
   * @method performAction
   */
  performAction(_action) {
    // TODO: start an action
    return Promise.resolve();
  }

  /**
   * @method cancelAction
   */
  cancelAction(_actionId, _actionName) {
    // TODO: interrupt/cancel an action
    return Promise.resolve();
  }

  // END Base class overloads

  addProperty(msgData) {
    this.properties.set(msgData.name, new USBSerialProperty(this, msgData));
  }

  send(request, data) {
    data.thingIndex = this.index;
    this.board.send(request, data);
  }
}

module.exports = USBSerialThing;

/*
||
|| @author         Brett Hagman <bhagman@roguerobotics.com>
|| @url            http://roguerobotics.com/
|| @url            http://oryng.org/
|| @contribution   Dave Hylands <github:dhylands>
|| @contribution   Alexander Brevig <https://alexanderbrevig.com/>
||
||
|| @license Please see LICENSE.
||
*/
