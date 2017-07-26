/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const assert = require("cassert");
const Promise = require('bluebird');
const i18n = require('i18n');
const events = require('events');

const { env } = require('../startup');

describe("ShutterController", function() {

  class DummyShutter extends env.devices.ShutterController {
    static initClass() {
  
      this.prototype.id = "dummyShutter";
      this.prototype.name = "DummyShutter";
    }

    moveToPosition(position) {
      // do nothing
      return Promise.resolve();
    }

    stop() {
      return Promise.resolve();
    }
  }
  DummyShutter.initClass();

  let shutter = null;

  beforeEach(() => shutter = new DummyShutter());

  describe("#_calculateRollingTime()", function() {

    it("should throw error when rollingTime is not defined", function() {
      try {
        shutter._calculateRollingTime(100);
        return assert(false);
      } catch (error) {
        // everything is fine
        return assert(error.message === "No rolling time configured.");
      }
    });

    it("should throw error when percentage out of range", function() {
      const test = function(percentage) {
        try {
          shutter._calculateRollingTime(percentage);
          return assert(false);
        } catch (error) {
          // everything is fine
          return assert(error.message === "percentage must be between 0 and 100");
        }
      };
      test(-1);
      return test(101);
    });

    return it("should calculate rolling time", function() {
      shutter.rollingTime = 1;
      assert(shutter._calculateRollingTime(100) === 1000);
      assert(shutter._calculateRollingTime(0) === 0);
      return assert(shutter._calculateRollingTime(50) === 500);
    });
  });

  describe("#_setPosition()", function() {

    it("should emit position if changed", function() {
      let emittedPosition = null;
      shutter.on("position", position => emittedPosition = position);
      shutter._setPosition("up");
      return assert(emittedPosition === "up");
    });

    return it("should do nothing when position did not change", function() {
      shutter.on("position", position => assert(false));
      shutter._position = "down";
      return shutter._setPosition("down");
    });
  });

  return describe("#moveByPercentage()", function() {

    it("should use absolute value for calculating rolling time", function() {
      shutter._calculateRollingTime = actual => assert(actual === 10);
      return shutter.moveByPercentage(-10);
    });

    it("should call moveUp when percentage is higher than zero", function() {
      let movingUp = null;
      shutter.moveUp = function() {
        movingUp = true;
        return Promise.resolve();
      };
      shutter.moveDown = () => assert(false);
      shutter.rollingTime = 1;
      shutter.moveByPercentage(100).done();
      return assert(movingUp);
    });

    it("should call moveDown when percentage is lower than zero", function() {
      let movingDown = null;
      shutter.moveUp = () => assert(false);
      shutter.moveDown = function() {
        movingDown = true;
        return Promise.resolve();
      };
      shutter.rollingTime = 1;
      shutter.moveByPercentage(-100).done();
      return assert(movingDown);
    });

    return it("should call stop when time is over", function(finish) {
      let stopped = false;
      shutter._calculateRollingTime = percentage => 100;
      shutter.moveUp = () => Promise.resolve();
      shutter.stop = () => {
        stopped = true;
        return Promise.resolve();
      };
      return shutter.moveByPercentage(10).then(function() {
        assert(stopped);
        return finish();
      }).done();
    });
  });
});
