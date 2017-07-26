/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
*Daemonizer

Orginal from [node-init](https://github.com/frodwith/node-init/blob/master/init.coffee)
modified by Oliver Schneider.

Copyright (c) 2011 Paul Driver

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

const fs = require('fs');
const daemon = require('daemon');
const stream = require('logrotate-stream');

exports.printStatus = function(st) {
  if (st.pid) {
    console.log('Process running with pid %d.', st.pid);
    return process.exit(0);

  } else if (st.exists) {
    console.log('Pidfile exists, but process is dead.');
    return process.exit(1);
  } else {
    console.log('Not running.');
    return process.exit(3);
  }
};

exports.status = function(pidfile, cb) {
  if (cb == null) { cb = exports.printStatus; }
  return fs.readFile(pidfile, 'utf8', function(err, data) {
    let match;
    if (err) {
      return cb({exists: err.code !== 'ENOENT'});
    } else if (match = /^\d+/.exec(data)) {
      const pid = parseInt(match[0]);
      try {
        process.kill(pid, 0);
        return cb({pid});
      } catch (e) {
        return cb({exists: true});
      }
    } else {
      return cb({exists: true});
    }
  });
};

exports.startSucceeded = function(pid) {
  if (pid) {
    return console.log('Process already running with pid %d.', pid);
  } else {
    return console.log('Started.');
  }
};

exports.startFailed = function(err) {
  console.log(err);
  return process.exit(1);
};

exports.start = function({ pidfile, logfile, run, success, failure }) {
  if (!success) { success = exports.startSucceeded; }
  if (!failure) { failure = exports.startFailed; }
  if (!logfile) { logfile = '/dev/null'; }

  const start = function(err) {
    if (err) { return failure(err); }
    if (process.env['PIMATIC_DAEMONIZED'] != null) { 
      // pipe strams to lofile:
      const logStream = stream({file: logfile, size: '1m', keep: 3});
      process.stdout.writeOut = process.stdout.write;
      process.stderr.writeOut = process.stderr.write;
      process.stdout.write = string => logStream.write(string);
      process.stderr.write = string => logStream.write(string);
      process.logStream = logStream;

      // write the pidfile
      return fs.writeFile(pidfile, process.pid, function(err) {
        if (err) { return failure(err); }
        return run();
      });
    } else { 
      //Restart as daemon:
      process.env['PIMATIC_DAEMONIZED'] = true;
      daemon.daemon(process.argv[1], process.argv.slice(2), {cwd: process.cwd()});
      return success();
    }
  };
      
  return exports.status(pidfile, function(st) {
    if (st.pid) {
      return success(st.pid, true);
    } else if (st.exists) {
      return fs.unlink(pidfile, start);
    } else {
      return start();
    }
  });
};


exports.stopped = function(killed) {
  if (killed) {
    console.log('Stopped.');
  } else {
    console.log('Not running.');
  }
  return process.exit(0);
};

exports.hardKiller = () =>
  function(pid, cb) {
    const checkInterval = 1000;
    const timeout = 10000;
    const signals = ['TERM', 'QUIT', 'KILL'];
    var tryKill = function(time){
      const sig = `SIG${signals[0]}`;
      try {
        if (time === 0) {
          console.log(`Sending ${sig} to pimatic(${pid}), waiting for process exit...`);
          // throws when the process no longer exists
          process.kill(pid, sig);
        } else if (time >= timeout) {
          console.log(`Process didn't shutdown in time, sending signal ${sig} to pimatic(${pid}), \
waiting for process exit...`
          );
          // throws when the process no longer exists
          process.kill(pid, sig);
          if (signals.length > 1) { signals.shift(); }
          time = 0;
        } else {
          // test if process exists
          process.kill(pid, 0);
        }
        return setTimeout((() => tryKill(time + checkInterval)), checkInterval);
      } catch (e) {
        const killed = e.code === 'ESRCH';
          // throws an error if the process was killed
        if (!killed) {
          console.error(`Couldn't kill process, error: ${e.message}`);
        }
        return cb(killed);
      }
    };

    return tryKill(0);
  }
;

exports.softKiller = function(timeout) {
  if (timeout == null) { timeout = 2000; }
  return function(pid, cb) {
    let sig = "SIGTERM";
    var tryKill = function() {
      try {
        // throws when the process no longer exists
        process.kill(pid, sig);
        console.log(`Waiting for pid ${pid}`);
        if (sig !== 0) { sig = 0; }
        const first = false;
        return setTimeout(tryKill, timeout);
      } catch (e) {
        return cb(sig === 0);
      }
    };
    return tryKill();
  };
};

exports.stop = function(pidfile, cb, killer) {
  if (cb == null) { cb = exports.stopped; }
  if (killer == null) { killer = exports.hardKiller(); }
  return exports.status(pidfile, function({pid}) {
    if (pid) {
      return killer(pid, killed => fs.unlink(pidfile, () => cb(killed)));
    } else {
      return cb(false);
    }
  });
};

exports.simple = function({pidfile, logfile, command, run, killer}) {
  if (!command) { command = process.argv[2]; }
  if (!killer) { killer = null; }
  const start = () => exports.start({ pidfile, logfile, run });
  switch (command) {
    case 'start':  return start();
    case 'stop':   return exports.stop(pidfile, null, killer);
    case 'status': return exports.status(pidfile);
    case 'restart': case 'force-reload':
      return exports.stop(pidfile, start, killer);
    case 'try-restart':
      return exports.stop(pidfile, function(killed) {
        if (killed) {
          return exports.start({ pidfile, logfile, run });
        } else {
          console.log('Not running.');
          return process.exit(1);
        }
      });
    default:
      console.log('Command must be one of: ' +
        'start|stop|status|restart|force-reload|try-restart'
      );
      return process.exit(1);
  }
};