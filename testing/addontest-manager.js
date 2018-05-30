class TestManager {

  constructor() {
    this.adapters = new Map();
    this.devices = {};
  }

  handleDeviceAdded(device) {
    this.devices[device.id] = device;

    // Now print all the juicy details of the new device
  }

  handleDeviceRemoved(device) {
    delete this.devices[device.id];
  }

  addAdapter(adapter) {
    // do nothing?
  }

  // shim
  emit(event, data) {
    console.log('Emit:', event);
  }
};

module.exports = TestManager;
