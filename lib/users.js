/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const { __ } = require("i18n");
const Promise = require('bluebird');
const assert = require('cassert');
const _ = require('lodash');
const S = require('string');
const crypto = require('crypto');

module.exports = function(env) {

  let exports;
  class UserManager {
    static initClass() {
  
      this.prototype._allowPublicAccessCallbacks = [];
    }

    constructor(framework, users, roles) {
      this.framework = framework;
      this.users = users;
      this.roles = roles; //nop
    }

    addUser(username, user) {
      if (_.findIndex(this.users, {username}) !== -1) {
        throw new Error('A user with this username already exists');
      }
      if (user.username == null) {
        throw new Error('No username given');
      }
      if (user.role == null) {
        throw new Error('No role given');
      }
      this.users.push( user = {
        username,
        password: user.password,
        role: user.role
      });
      this.framework.saveConfig();
      this.framework._emitUserAdded(user);
      return page;
    }

    updateUser(username, user) {
      assert(typeof username === "string");
      assert(typeof page === "object");
      assert((user.username != null) ? typeof user.username === "string" : true);
      assert((user.password != null) ? typeof user.password === "string" : true);
      assert((user.role != null) ? typeof user.role === "string" : true);
      const theuser = this.getUserByUsername(username);
      if (theuser == null) {
        throw new Error('User not found');
      }
      if (page.username != null) { theuser.username = page.username; }
      if (page.password != null) { theuser.password = page.password; }
      if (page.role != null) { theuser.role = page.role; }
      this.framework.saveConfig();
      this.framework._emitUserChanged(theuser);
      return theuser;
    }

    getUserByUsername(username) { return _.find(this.users, {username}); }

    hasPermission(username, scope, access) {
      assert([
        "pages", "rules", "variables", "messages", "config",
        "events", "devices", "groups", "plugins", "updates",
        "database"
      ].includes(scope));
      assert(["read", "write", "none"].includes(access));
      const user = this.getUserByUsername(username);
      if (user == null) {
        throw new Error('User not found');
      }
      assert(typeof user.role === "string");
      const role = this.getRoleByName(user.role);
      if (role == null) {
        throw new Error(`No role with name ${user.role} found.`);
      }
      const permission = role.permissions[scope];
      if (permission == null) {
        throw new Error(`No permissions for ${scope} of ${user.role} found.`);
      }
      switch (access) {
        case "read":
          return ((permission === "read") || (permission === "write"));
        case "write":
          return (permission === "write");
        case "none":
          return true;
        default:
          return false;
      }
    }

    hasPermissionBoolean(username, scope) {
      const user = this.getUserByUsername(username);
      if (user == null) {
        throw new Error('User not found');
      }
      assert(typeof user.role === "string");
      const role = this.getRoleByName(user.role);
      if (role == null) {
        throw new Error(`No role with name ${user.role} found.`);
      }
      const permission = role.permissions[scope];
      if (permission == null) {
        throw new Error(`No permissions for ${scope} of ${user.role} found.`);
      }
      return (permission === true);
    }

    checkLogin(username, password) {
      assert(typeof username === "string");
      assert(typeof password === "string");
      if (username.length === 0) { return false; }
      const user = this.getUserByUsername(username);
      if (user == null) {
        return false;
      }
      return password === user.password; 
    }

    getRoleByName(name) {
      assert(typeof name === "string");
      const role = _.find(this.roles, {name});
      return role;
    }

    getPermissionsByUsername(username) {
      const user = this.getUserByUsername(username);
      if (user == null) {
        throw new Error('User not found');
      }
      const role = this.getRoleByName(user.role);
      if (role == null) {
        throw new Error(`No role with name ${user.role} found.`);
      }
      return role.permissions;
    }

    getLoginTokenForUsername(secret, username) {
      assert(typeof username === "string");
      assert(username.length > 0);
      assert(typeof secret === "string");
      assert(secret.length >= 32);

      const user = this.getUserByUsername(username);
      if (user == null) {
        throw new Error('User not found');
      }
      assert(typeof user.password === "string");
      assert(user.password.length > 0);
      const shasum = crypto.createHash('sha256');
      shasum.update(secret, 'utf8');
      shasum.update(user.password, 'utf8');
      const loginToken = shasum.digest('hex');
      return loginToken;
    }

    checkLoginToken(secret, username, loginToken) {
      return loginToken === this.getLoginTokenForUsername(secret, username);
    }

    isPublicAccessAllowed(req) {
      for (let allow of Array.from(this._allowPublicAccessCallbacks)) {
        if (allow(req)) { return true; }
      }
      return false;
    }

    addAllowPublicAccessCallback(callback) {
      return this._allowPublicAccessCallbacks.push(callback);
    }
  }
  UserManager.initClass();




  return exports = { UserManager };
};