/*
|| USBSerialLookup
|| A set of functions to manage data lookup/mapping.
||
|| More notes at the bottom.
*/


'use strict';

const USBSerialLookup = module.exports = {};

/*
enum ThingAdapterRequest
{
  DEFINEADAPTER       = 0x00,
  DEFINETHINGBYIDX    = 0x01,
  DEFINEPROPERTYBYIDX = 0x02,
  DEFINEEVENTBYIDX    = 0x03,
  DEFINEACTIONBYIDX   = 0x04,
  SETPROPERTY         = 0x05,
  GETPROPERTY         = 0x06,
  PAIR                = 0xfd, // Enable Thing communication with host
  UNPAIR              = 0xfe
};

enum ThingAdapterResponse
{
  DETAILADAPTER       = 0x00,
  DETAILTHINGBYIDX    = 0x01,
  DETAILPROPERTYBYIDX = 0x02,
  DETAILEVENTBYIDX    = 0x03,
  DETAILACTIONBYIDX   = 0x04,
  PROPERTYSTATUS      = 0x05,
  PAIRED              = 0xfd,
  UNPAIRED            = 0xfe,
  ERROR               = 0xff
};
*/

function requestValueLookup(requestName) {
  let value = '0xff';

  switch (requestName) {
    case 'defineAdapter':
      value = 0x00;
      break;
    case 'defineThingByIdx':
      value = 0x01;
      break;
    case 'definePropertyByIdx':
      value = 0x02;
      break;
    case 'defineEventByIdx':
      value = 0x03;
      break;
    case 'defineActionByIdx':
      value = 0x04;
      break;
    case 'setProperty':
      value = 0x05;
      break;
    case 'getProperty':
      value = 0x06;
      break;
    case 'pair':
      value = 0xfd;
      break;
    case 'unpair':
      value = 0xfe;
      break;
    default:
      value = 0xff;
      break;
  }

  return value;
}

USBSerialLookup.requestValueLookup = requestValueLookup;


function responseNameLookup(responseValue) {
  let name = 'unknown';

  switch (responseValue) {
    case 0x00:
      name = 'detailAdapter';
      break;
    case 0x01:
      name = 'detailThingByIdx';
      break;
    case 0x02:
      name = 'detailPropertyByIdx';
      break;
    case 0x03:
      name = 'detailEventByIdx';
      break;
    case 0x04:
      name = 'detailActionByIdx';
      break;
    case 0x05:
      name = 'propertyStatus';
      break;
    case 0xfd:
      name = 'paired';
      break;
    case 0xfe:
      name = 'unpaired';
      break;
    case 0xff:
      name = 'error';
      break;
    default:
      name = 'unknown';
      break;
  }

  return name;
}

USBSerialLookup.responseNameLookup = responseNameLookup;


function responseValueLookup(responseName) {
  let value = 0xff; // default to 'error'

  switch (responseName) {
    case 'detailAdapter':
      value = 0x00;
      break;
    case 'detailThingByIdx':
      value = 0x01;
      break;
    case 'detailPropertyByIdx':
      value = 0x02;
      break;
    case 'detailEventByIdx':
      value = 0x03;
      break;
    case 'detailActionByIdx':
      value = 0x04;
      break;
    case 'propertyStatus':
      value = 0x05;
      break;
    case 'pair':
      value = 0xfd;
      break;
    case 'unpair':
      value = 0xfe;
      break;
    case 'error':
    default:
      value = 0xff;
      break;
  }

  return value;
}

USBSerialLookup.responseValueLookup = responseValueLookup;


/*
  THING               = 0x00,
  ONOFFSWITCH         = 0x01,
  MULTILEVELSWITCH    = 0x02,
  BINARYSENSOR        = 0x03,
  MULTILEVELSENSOR    = 0x04,
  SMARTPLUG           = 0x05,
  ONOFFLIGHT          = 0x06,
  DIMMABLELIGHT       = 0x07,
  ONOFFCOLORLIGHT     = 0x08,
  DIMMABLEDCOLORLIGHT = 0x09
*/
function thingTypeLookup(value) {
  let thingType = '';

  switch (value) {
    case 0x00:
      thingType = 'thing';
      break;
    case 0x01:
      thingType = 'onOffSwitch';
      break;
    case 0x02:
      thingType = 'multilevelSwitch';
      break;
    case 0x03:
      thingType = 'binarySensor';
      break;
    case 0x04:
      thingType = 'multilevelSensor';
      break;
    case 0x05:
      thingType = 'smartPlug';
      break;
    case 0x06:
      thingType = 'onOffLight';
      break;
    case 0x07:
      thingType = 'dimmableLight';
      break;
    case 0x08:
      thingType = 'onOffColorLight';
      break;
    case 0x09:
      thingType = 'dimmableColorLight';
      break;
    default:
      thingType = 'unknown';
      break;
  }
  return thingType;
}

USBSerialLookup.thingTypeLookup = thingTypeLookup;


function propertyTypeLookup(value) {
  switch (value) {
    case 0x00:
      // true/false
      return 'boolean';
      break;
    case 0x01:
      // 32 bit signed integer -- int32_t, sent via U32
      return 'number';
      break;
    case 0x02:
      // string
      return 'string';
      break;
    default:
      return 'unknown';
      break;
  }
}

USBSerialLookup.propertyTypeLookup = propertyTypeLookup;


function propertyValueConversion(propertyType, value)
{
  switch (propertyType)
  {
    case 0x00:
      // true/false
      return !!value;
      break;
    case 0x01:
      // 32 bit signed integer, sent as U32
      // TODO: convert to signed integer? (may be handled by SimplePack unpacking)
      return value;
      break;
    case 0x02:
      // string
      return value;
      break;
    default:
      return 'unknown';
      break;
  }
}

USBSerialLookup.propertyValueConversion = propertyValueConversion;

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
