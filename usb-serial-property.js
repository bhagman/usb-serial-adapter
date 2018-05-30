/*
|| USBSerialProperty
|| A class to manage property details for Things - one of many per Thing.
||
|| More notes at the bottom.
*/

'use strict';

let LOCALTESTING = require('./testing/testing');

let Property;

if (LOCALTESTING == true) {
  Property = require('./testing/property');
} else {
  const gwa = require('gateway-addon');
  Property = gwa.Property;
}
//const {
//  Property
//} = require('gateway-addon');

class USBSerialProperty extends Property {

  constructor(device, msgData) {
    // Fields copied in from super: 'type', 'unit', 'description', 'minimum', 'maximum'
    super(device, msgData.name, msgData);
    this.index = msgData.index; // For managing on the lightweight MCUs
    this.setCachedValue(msgData.value);
  }

  /**
   * @method setValue
   * @returns a promise which resolves to the updated value.
   *
   * @note Our mechanism for setting values requires sending a
   * separate message to the device, and relying on the device
   * to send a propertyStatus message after the value has been
   * set.  Hence, we resolve the promise immediately here, and
   * rely on the message handler to provide the updated value
   * through the propertyStatus message in
   * USBSerialThing.notifyPropertyChanged().
   */
  setValue(value) {
    // Dispatch a message to the thing
    this.device.send('setProperty', {
      propertyIndex: this.index,
      value: value
    });
    // We don't rely on the device to tell us that the value changed,
    // so we resolve the promise right away.
    return Promise.resolve(value);
  }
}

module.exports = USBSerialProperty;

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
