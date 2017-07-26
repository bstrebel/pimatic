/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
module.exports = function(grunt) {

  let plugin;
  let path = require("path");
  // all node_modules:
  const modules = require("fs").readdirSync("..");
  // just the pimatic-* modules:
  const plugins = (Array.from(modules).filter((module) => (module.match(/^pimatic-.*/) != null)));

  // package.json files of plugins
  const pluginPackageJson = ((() => {
    const result = [];
    for (plugin of Array.from(plugins)) {       result.push(`../${plugin}/package.json`);
    }
    return result;
  })());

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),
    coffeelint: {
      app: [
        "*.coffee",
        "../pimatic-*/*.coffee",
        "lib/**/*.coffee",
        "test/**/*.coffee"
      ],
      options: {
        no_trailing_whitespace: {
          level: "ignore"
        },
        max_line_length: {
          value: 100
        },
        indentation: {
          value: 2,
          level: "error"
        },
        no_unnecessary_fat_arrows: {
          level: 'ignore'
        }
      }
    },

    mochaTest: {
      test: {
        options: {
          reporter: "spec",
          require: ['coffee-errors']
        }, //needed for right line numbers in errors
        src: ["test/*"]
      },
      testPlugin: {
        options: {
          reporter: "spec",
          require: ['coffee-errors']
        }, //needed for right line numbers in errors
        src: ["test/plugins-test.coffee"]
      },
      // blanket is used to record coverage
      testBlanket: {
        options: {
          reporter: "dot"
        },
        src: ["test/*"]
      },
      coverage: {
        options: {
          reporter: "html-cov",
          quiet: true,
          captureFile: "coverage.html"
        },
        src: ["test/*"]
      }
    }});

  grunt.loadNpmTasks("grunt-coffeelint");
  grunt.loadNpmTasks("grunt-mocha-test");

  grunt.registerTask("blanket", () => {
    const blanket = require("blanket");

    return blanket({
      pattern(file) {
        if (file.match("pimatic/lib")) { return true; }
        //if file.match "pimatic/node_modules" then return false
        const withoutPrefix = file.replace(/.*\/node_modules\/pimatic/, "");
        return (!withoutPrefix.match('node_modules')) && (!withoutPrefix.match("/test/"));
      },
      loader: "./node-loaders/coffee-script"
    });
  });

  grunt.registerTask("clean-coverage", () => {
    const fs = require("fs");
    path = require("path");

    const replaceAll = (find, replace, str) => { 
      const escapeRegExp = str => str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
      return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
    };

    const file = `${__dirname}/coverage.html`;
    let html = fs.readFileSync(file).toString();
    html = replaceAll(path.dirname(__dirname), "", html);
    return fs.writeFileSync(file, html);
  });

  // Default task(s).
  grunt.registerTask("default", ["coffeelint", "mochaTest:test"]);
  grunt.registerTask("test", ["coffeelint", "mochaTest:test"]);
  grunt.registerTask("coverage", 
    ["blanket", "mochaTest:testBlanket", "mochaTest:coverage", "clean-coverage"]);

  return (() => {
    const result1 = [];
    for (plugin of Array.from(plugins)) {
      result1.push((plugin => {
        grunt.registerTask(`setEnv:${plugin}`, () => {
          return process.env['PIMATIC_PLUGIN_TEST'] = plugin;
        });

        return grunt.registerTask(`test:${plugin}`, [`setEnv:${plugin}`, "mochaTest:testPlugin"]);
      })(plugin));
    }
    return result1;
  })();
};