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
  class GroupManager {

    constructor(framework, groups) {
      this.framework = framework;
      this.groups = groups; //nop
    }

    addGroup(id, group) {
      if (_.findIndex(this.groups, {id}) !== -1) {
        throw new Error('A group with this ID already exists');
      }
      if (group.name == null) {
        throw new Error('No name given');
      }
      this.groups.push( group = {
        id,
        name: group.name,
        devices: [],
        rules: [],
        variables: []
      });

      this.framework.saveConfig();
      this.framework._emitGroupAdded(group);
      return group;
    }

    updateGroup(id, patch) {
      let index = _.findIndex(this.groups, {id});
      if (index === -1) {
        throw new Error('Group not found');
      }
      const group = this.groups[index];

      if (patch.name != null) {
        group.name = patch.name;
      }
      if (patch.devicesOrder != null) {
        group.devices = _.sortBy(group.devices, deviceId => { 
          index = patch.devicesOrder.indexOf(deviceId);
          if (index === -1) { return 99999; } else { return index; } // push it to the end if not found
        });
      }
      if (patch.rulesOrder != null) {
        group.rules = _.sortBy(group.rules, ruleId => {
          index = patch.rulesOrder.indexOf(ruleId);
          if (index === -1) { return 99999; } else { return index; } // push it to the end if not found
        });
      }
      if (patch.variablesOrder) {
        group.variables = _.sortBy(group.variables, variableName => {
          index = patch.variablesOrder.indexOf(variableName);
          if (index === -1) { return 99999; } else { return index; } // push it to the end if not found
        });
      }
      this.framework.saveConfig();
      this.framework._emitGroupChanged(group);
      return group;
    }

    getGroupById(id) { return _.find(this.groups, {id}); }

    addDeviceToGroup(groupId, deviceId, position) {
      assert(typeof deviceId === "string");
      assert(typeof groupId === "string");
      assert((position != null) ? typeof position === "number" : true);
      const group = this.getGroupById(groupId);
      if (group == null) {
        throw new Error('Could not find the group');
      }
      const oldGroup = this.getGroupOfDevice(deviceId);
      if (oldGroup != null) {
        //remove rule from all other groups
        _.remove(oldGroup.devices, id => id === deviceId);
        this.framework._emitGroupChanged(oldGroup);
      }
      if ((position == null) && !(position >= group.devices.length)) {
        group.devices.push(deviceId);
      } else {
        group.devices.splice(position, 0, deviceId);
      }
      this.framework.saveConfig();
      this.framework._emitGroupChanged(group);
      return group;
    }

    getGroupOfRule(ruleId) {
      for (let g of Array.from(this.groups)) {
        const index = _.indexOf(g.rules, ruleId);
        if (index !== -1) { return g; }
      }
      return null;
    }

    addRuleToGroup(groupId, ruleId, position) {
      assert(typeof ruleId === "string");
      assert(typeof groupId === "string");
      assert((position != null) ? typeof position === "number" : true);
      const group = this.getGroupById(groupId);
      if (group == null) {
        throw new Error('Could not find the group');
      }
      const oldGroup = this.getGroupOfRule(ruleId);
      if (oldGroup != null) {
        //remove rule from all other groups
        _.remove(oldGroup.rules, id => id === ruleId);
        this.framework._emitGroupChanged(oldGroup);
      }
      if ((position == null) && !(position >= group.rules.length)) {
        group.rules.push(ruleId);
      } else {
        group.rules.splice(position, 0, ruleId);
      }
      this.framework.saveConfig();
      this.framework._emitGroupChanged(group);
      return group;
    }

    getGroupOfVariable(variableName) {
      for (let g of Array.from(this.groups)) {
        const index = _.indexOf(g.variables, variableName);
        if (index !== -1) { return g; }
      }
      return null;
    }

    removeDeviceFromGroup(groupId, deviceId) {
      const group = this.getGroupOfDevice(deviceId);
      if (group == null) {
        throw new Error('Device is in no group');
      }
      if (group.id !== groupId) {
        throw new Error(`Device is not in group ${groupId}`);
      }
      _.remove(group.devices, id => id === deviceId);
      this.framework.saveConfig();
      this.framework._emitGroupChanged(group);
      return group;
    }

    removeRuleFromGroup(groupId, ruleId) {
      const group = this.getGroupOfRule(ruleId);
      if (group == null) {
        throw new Error('Rule is in no group');
      }
      if (group.id !== groupId) {
        throw new Error(`Rule is not in group ${groupId}`);
      }
      _.remove(group.rules, id => id === ruleId);
      this.framework.saveConfig();
      this.framework._emitGroupChanged(group);
      return group;
    }

    removeVariableFromGroup(groupId, variableName) {
      const group = this.getGroupOfVariable(variableName);
      if (group == null) {
        throw new Error('Variable is in no group');
      }
      if (group.id !== groupId) {
        throw new Error(`Variable is not in group ${groupId}`);
      }
      _.remove(group.variables, name => name === variableName);
      this.framework.saveConfig();
      this.framework._emitGroupChanged(group);
      return group;
    }

    addVariableToGroup(groupId, variableName, position) {
      assert(typeof variableName === "string");
      assert(typeof groupId === "string");
      assert((position != null) ? typeof position === "number" : true);
      const group = this.getGroupById(groupId);
      if (group == null) {
        throw new Error('Could not find the group');
      }
      const oldGroup = this.getGroupOfVariable(variableName);
      if (oldGroup != null) {
        //remove rule from all other groups
        _.remove(oldGroup.variables, name => name === variableName);
        this.framework._emitGroupChanged(oldGroup);
      }
      if ((position == null) && !(position >= group.variables.length)) {
        group.variables.push(variableName);
      } else {
        group.variables.splice(position, 0, variableName);
      }
      this.framework.saveConfig();
      this.framework._emitGroupChanged(group);
      return group;
    }

    removeGroup(id, page) {
      const removedGroup = _.remove(this.groups, {id});
      if (removedGroup.length > 0) { this.framework.saveConfig(); }
      this.framework._emitGroupRemoved(removedGroup[0]);
      return removedGroup;
    }

    getGroupOfDevice(deviceId) {
      for (let g of Array.from(this.groups)) {
        const index = _.indexOf(g.devices, deviceId);
        if (index !== -1) { return g; }
      }
      return null;
    }

    getGroups() {
      return this.groups;
    }

    updateGroupOrder(groupOrder) {
      assert((groupOrder != null) && Array.isArray(groupOrder));
      this.framework.config.groups = (this.groups = _.sortBy(this.groups,  group => {
        const index = groupOrder.indexOf(group.id);
        if (index === -1) { return 99999; } else { return index; } // push it to the end if not found
      }));
      this.framework.saveConfig();
      this.framework._emitGroupOrderChanged(groupOrder);
      return groupOrder;
    }
  }

  return exports = { GroupManager };
};
