/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */


const { __ } = require("i18n");
const Promise = require('bluebird');
const assert = require('cassert');
const _ = require('lodash');
const S = require('string');

module.exports = function(env) {

  let exports;
  class PageManager {

    constructor(framework, pages) {
      this.framework = framework;
      this.pages = pages; //nop
    }

    addPage(id, page) {
      if (_.findIndex(this.pages, {id}) !== -1) {
        throw new Error('A page with this ID already exists');
      }
      if (page.name == null) {
        throw new Error('No name given');
      }
      this.pages.push( page = {
        id,
        name: page.name,
        devices: []
      });
      this.framework.saveConfig();
      this.framework._emitPageAdded(page);
      return page;
    }

    updatePage(id, page) {
      assert(typeof id === "string");
      assert(typeof page === "object");
      assert((page.name != null) ? typeof page.name === "string" : true);
      assert((page.devicesOrder != null) ? Array.isArray(page.devicesOrder) : true);
      const thepage = this.getPageById(id);
      if (thepage == null) {
        throw new Error('Page not found');
      }
      if (page.name != null) { thepage.name = page.name; }
      if (page.devicesOrder != null) {
        thepage.devices = _.sortBy(thepage.devices,  device => { 
          const index = page.devicesOrder.indexOf(device.deviceId);
          // push it to the end if not found
          if (index === -1) { return 99999; } else { return index; } 
        });
      }
      this.framework.saveConfig();
      this.framework._emitPageChanged(thepage);
      return thepage;
    }

    getPageById(id) { return _.find(this.pages, {id}); }

    addDeviceToPage(pageId, deviceId) {
      const page = this.getPageById(pageId);
      if (page == null) {
        throw new Error('Could not find the page');
      }
      page.devices.push({
        deviceId
      });
      this.framework.saveConfig();
      this.framework._emitPageChanged(page);
      return page;
    }

    removeDeviceFromPage(pageId, deviceId) {
      const page = this.getPageById(pageId);
      if (page == null) {
        throw new Error('Could not find the page');
      }
      _.remove(page.devices, {deviceId});
      this.framework.saveConfig();
      this.framework._emitPageChanged(page);
      return page;
    }

    removeDeviceFromAllPages(deviceId) {
      for (let page of Array.from(this.pages)) {
        const removed = _.remove(page.devices, {deviceId});
        if (removed.length > 0) {
          this.framework._emitPageChanged(page);
        }
      }
      return this.framework.saveConfig();
    }

    removePage(id, page) {
      const removedPage = _.remove(this.pages, {id});
      if (removedPage.length > 0) { this.framework.saveConfig(); }
      this.framework._emitPageRemoved(removedPage[0]);
      return removedPage;
    }

    getPages(role) {
      if (role == null) { role = "admin"; }
      return this.pages.filter(function(page) {
        if (page.allowedRoles != null) { return page.allowedRoles.indexOf(role) !== -1; } else { return true; }
      });
    }

    updatePageOrder(pageOrder) {
      assert((pageOrder != null) && Array.isArray(pageOrder));
      this.framework.config.pages = (this.pages = _.sortBy(this.pages,  page => { 
        const index = pageOrder.indexOf(page.id); 
        if (index === -1) { return 99999; } else { return index; } // push it to the end if not found
      }));
      this.framework.saveConfig();
      this.framework._emitPageOrderChanged(pageOrder);
      return pageOrder;
    }
  }

  return exports = { PageManager };
};
