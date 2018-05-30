/*
|| USBSerialDevice
|| A class to manage individual Things - one of many on a board (per USB serial port).
||
|| More notes at the bottom.
*/


const USBSerialAdapter = require('./usb-serial-adapter');
const TestManager = require('./testing/addontest-manager.js');


function loadAdapter() {
  let myManager = new TestManager();
  const manifestData = fs.readFileSync('./testing/testpackage.json');
  const manifest = JSON.parse(manifestData);
  return new USBSerialAdapter(myManager, manifest);
}

/*
  Notes:

  const loadAdapter = require('./USBSerialTest');
  usbtest = loadAdapter();

  usbtest.boards['COM24'].send('unpair', { thingIndex: 0 });
*/

module.exports = loadAdapter;

/*
||
|| @author         Brett Hagman <bhagman@roguerobotics.com>
|| @url            http://roguerobotics.com/
|| @url            http://oryng.org/
||
|| @license Please see LICENSE.
||
*/
