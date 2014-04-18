var _ = require('alloy')._;
	
/**
 * @property {Function} dummyClass Empty function that is used as a class/constructor by the define-method to create a valid
 *  prototype-chain, without invoking actual parent constructor.
 * @private
 */
var dummyClass = function() {};

/**
 * ClassManager manages defining and creating classes.
 * 
 * @class ClassManager
 * @singleton
 */
var ClassManager = {
	/**
	 * Define a new Class.
	 *
	 * If the class contains a 'construct'-method, it will be called upon construction of a new instance.
	 * 
	 * @param {String} name Name of the Class
	 * @param {Object} definition The body of the class (containing all methods and properties)
	 * @param {Object} [ct] A container that is to contain this object's definition
	 * @return {Function} The defined class
	 */
	define: function(name, definition, ct) {
		var staticDef = definition.statics || {},
			parent,
			cls;
			
		if (definition.extend) {
			parent = _.isString(definition.extend) ? require(definition.extend) : definition.extend;
		}
			
		delete definition.extend;
		delete definition.statics;
		
		// Set the classname static property	
		staticDef.classname || (staticDef.classname = name);
		
		// Set up the constructor
		if (definition.hasOwnProperty('initialize')) {
			cls = definition.initialize;
		} else if (definition.hasOwnProperty('construct')) {
			cls = definition.construct;
		} else if (parent) {
			cls = function() {
				parent.apply(this, arguments);
			};
		} else {
			cls = function() {};
		}
		
		// Inherit the parent if one is set
		if (parent) {
			cls = _.extend(cls, parent);
			
			dummyClass.prototype = parent.prototype;
			cls.prototype = new dummyClass();
			_.extend(cls.prototype, definition);
			
			staticDef.parent = parent.prototype;
		} else {
			cls.prototype = _.clone(definition);
		}
		
		// Add the static defintion
		_.extend(cls, staticDef);
		
		cls.prototype.constructor = cls;
		cls.prototype.statics = cls;
		
		// If a container (module most likely) was passed,
		// assign the class definition to its exports-property 
		ct && (ct.exports = cls);
	
		return cls;
	}
};

module.exports = ClassManager;