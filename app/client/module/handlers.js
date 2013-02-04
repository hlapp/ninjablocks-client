var
	path = require('path')
	, util = require('util')
	, fs = require('fs')
;

module.exports = moduleHandlers;

function moduleHandlers(client) {

	client.prototype.loadModule = function loadModule(name, opts, app, cb) {

		if(!name) {

			this.log.error("loadModule error: invalid module name");
			return cb("Invalid module name", null);
		}
		cb = cb || function() {};
		try {

			var
				file = path.resolve(

					process.cwd()
					, 'ninja_modules'
					, name
				)
			;

			if(existsSync(file)) {

				var mod = require(file);
				mod.prototype.opts = opts;
			}
			else {

				this.log.error("loadModule error: No such module '%s'", name);
				cb(Error(util.format("No such module (%s)", name)), null);
				return;
			}
		}
		catch(e) {

			this.log.error("loadModule error: %s (%s)", e, name);
			return cb(e, null);
		}

		this.addModule(name, opts, mod, app, cb);
	};


	client.prototype.addModule = function addModule(name, params, mod, app, cb) {

		if(!mod) {
			var err = new Error('Invalid module provided');
			this.log.error(err);
			return cb(err, null);
		}

		var newModule = new mod(params, app);

		this.log.info("loadModule success: %s", name);
		this.modules[name] = newModule;
		this.bindModule(newModule, name);

		cb(null, newModule);
	};

	client.prototype.bindModule = function bindModule(mod, name) {

		mod.log = this.log;
		mod.save = function emitSave() { this.emit('save'); }.bind(mod);
		mod.on('register', this.registerDevice.bind(this));
		mod.on('error', this.moduleError.bind(mod));
		mod.on('save', this.saveHandler.call(mod, name));
		// set data handlers after registration
	};

	client.prototype.saveHandler = function saveHandler(name) {

		var mod = this;
		return function saveConfig() {

			var
				conf = this.opts || null
				, file = path.resolve(

					process.cwd()
					, 'config'
					, name
					, 'config.json'
				)
				, data = null
			;

			if(!conf) {

				mod.log.debug("saveConfig: No config to save (%s)", name);
				return false;
			}

			data = JSON.stringify({ config : conf }, null, '\t');

			if(!data) {

				mod.log.debug("saveConfig: No JSON parsed (%s)", name);
				return false;
			}

			this.log.debug("saveConfig: writing config (%s)", file);

			mkdirp(path.dirname(file), ready);

			function ready(err) {

				if(err) {

					return mod.log.error(

						"saveConfig: directory error: %s (%s)"
						, err
						, path.dirname(file)
					);
				}
				fs.writeFile(file, data, done);

			};

			function done(err) {

				if(err) {

					return mod.log.error("saveConfig: write failure (%s)", name);
				}
				mod.log.debug("saveConfig: great success! (%s)", name);
			};

			return true;

		}.bind(this);
	};

	client.prototype.registerDevice = function registerDevice(device) {

		if(!device) { return; }

		device.guid = this.getGuid(device);
		device.on('data', this.dataHandler.call(this, device));
		device.on('error', this.errorHandler.call(this, device))
		this.log.debug("Registering device %s", device.guid);
		this.devices[device.guid] = device;
		this.app.emit("device::up", device.guid);
	};

	
	client.prototype.errorHandler = function(device) {
		
		var self = this;
		return function(err) {

			self.log.error("device: %s", err);
			if(device.unregister) { 

				process.nextTick(device.unregister);
			}
			self.emit("device::down", device);
		}
	};

	client.prototype.moduleError = function moduleError(err) {

		this.log.error("Module error: %s", err);
	};

	client.prototype.moduleHandlers = {

		config : require('./config')
		, install : require('./install')
		, uninstall : require('./uninstall')

	};
};

function existsSync(file) {

	if(fs.existsSync) { return fs.existsSync(file); }
	return path.existsSync(file);
};
