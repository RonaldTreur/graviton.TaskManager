var ClassManager = require('ClassManager');

/**
 * @class Task.IterationTask
 * @extends Task.Task
 * 
 * Representation of a task that is to iterate over a collection (array or object).
 * 
 * Note that the list you add will only be evaluated the moment the task is executed.
 * 
 * This Task does no currently support asynchronous iterators. If your iterator performs an asynchronous task
 * (e.g. when performing a cloud call) then the iterations will be perfomed (partially) in a parallel fashion.
 */
var IterationTask = ClassManager.define('Task.IterationTask', {
	extend: 'Task/Task',
	
	/**
	 * @property {Number} step The number of iteration to perform before checking if a new Task got precedence.
	 * 
	 * The higher this number, the more performant the iteration, yet the longer the app is blocked.
	 */
	step: 1,
	
	/**
	 * @property {Boolean} isArray True if an array is to be traversed, false if it is an object instead
	 * @readonly
	 */
	isArray: false,
	
	/**
	 * @property {Object|Array} list The collection that needs to be traversed
	 */
	list: null,
	
	/**
	 * @property {Array} keys If collection is an object, then this array will contain all its keys
	 * @readonly
	 */
	keys: null,
	
	/**
	 * @property {"each"|"map"|"reduce"} iterationType One of the Task.IterationTask#type values.
	 */
	iterationType: null,
	
	/**
	 * @property {Function} iterator The (internal) function that is applied to each element in the list
	 * @readonly
	 */
	iterator: null,
	
	/**
	 * @property {Number} currentIteration The current iteration index
	 * @readonly
	 */
	currentIteration: -1,
	
	statics: {
		/**
		 * @property {Object} type The iteration types to choose from
		 * @property {"each"} type.EACH Iterate without saving any result values
		 * @property {"map"} type.MAP Iterate while saving the result of each iteration into the tasks's results
		 * @property {"reduce"} type.REDUCE Iterate while updateing the result during each iteration
		 * @static
		 * @readonly
		 */
		type: {
			EACH: 'each',
			MAP: 'map',
			REDUCE: 'reduce'
		}
	},
	
	/**
	 * @inheritdoc Task.Task#constructor
	 * @constructor
	 * @localdoc
	 * @param {String} [config.type=Task.IterationTask.type.EACH] One of the IterationTask.type values 
	 */
	construct: function(config) {
		this.list = config.list;
		this.iterationType = config.type || this.statics.type.EACH;
		
		config.step && (this.step = config.step);
		
		this.statics.parent.construct.call(this, config);
	},
	
	/**
	 * Execute this task.
	 * 
	 * @param {Object} owner The context in which the task is executed (unless bound to something else)
	 * @param {Function} next Function that tells the TaskManager to schedule the next task
	 * @param {Boolean} [manualOverride=false] True if called outside of the normal flow of TaskManager, false otherwise
	 */
	execute: function(owner, next, manualOverride) {
		var isArray = Array.isArray(this.list),
			context = this.context || owner.origin,
			state = this.statics.state,
			me = this,
			next, length, onComplete;

		if (this.state == state.ACTIVE || this.state == state.COMPLETE)
			return this.result; // This should never happen (but make sure to never execute twice)

		if (isArray) {
			length = this.list.length;
		} else {
			this.keys = Object.keys(this.list);
			length = this.keys.length;
		}
		
		// When mapping set up an empty array or object
		if (!this.result && this.type == this.statics.type.MAP) {
			this.result = isArray ? Array(this.list.length) : {};
		}
		
		// Get the proper iterator, based on the iteration type
		if (!this.iterator) {
			switch (this.type) {
				case (this.statics.type.MAP):
					this.iterator = isArray ? _mapArray(this, context) : _mapDictionary(this, context);
					break;
					
				case (this.statics.type.REDUCE):
					this.iterator = isArray ? _reduceArray(this, context) : _reduceDictionary(this, context);
					break;
					
				default:
					this.iterator = isArray ? _eachArray(this, context) : _eachDictionary(this, context);
			}
		}
		
		// Invoked when the iteration is complete
		onComplete = function() {
			me.state = state.COMPLETE;
			// Alert this task's owner
			owner.completed(me, manualOverride);
			// Invoke the (optional) callback
			me.callback && me.callback.call(me.context, me.result);
			// Continue
			next(me.result);
		};
		
		// Invoked after each iteration
		nextIteration = function() {
			var idx = me.currentIteration;
			
			// Only iterate if we are (still) expected to
			if (me.state != state.ACTIVE && me.state != state.PENDING)
				return;
					
			if (idx < length) {
				idx % me.step == 0 ? _.defer(iterate) : iterate();
			} else {
				onComplete();
			}
		};
		
		// The iterator
		iterate = function() {
			me.iterator(me.currentIteration);
			me.currentIteration++;
			nextIteration();
		};
		
		this.state = state.ACTIVE;
		// Execute
		iterate();
	}
}, module);


/**
 * Returns an iterator used to mimic [Underscore's map](http://underscorejs.org/#each) behavior on arrays.
 * @private
 * 
 * @param {Task.Task} task The task that defines this iteration
 * @param {Object} context The context in which to execute each iteration
 */
function _eachArray(task, context) {
	var list = task.list;
	
	return function(idx) {
		task.fn.call(context, list[idx], idx, list);
	};
}

/**
 * Returns an iterator used to mimic [Underscore's map](http://underscorejs.org/#map) behavior on arrays.
 * @private
 * 
 * @param {Task.Task} task The task that defines this iteration
 * @param {Object} context The context in which to execute each iteration
 */
function _mapArray(task, context) {
	var list = task.list;
	
	return function(idx) {
		task.result[idx] = task.fn.call(context, list[idx], idx, list);
	};
}

/**
 * Returns an iterator used to mimic [Underscore's map](http://underscorejs.org/#reduce) behavior on arrays.
 * @private
 * 
 * @param {Task.Task} task The task that defines this iteration
 * @param {Object} context The context in which to execute each iteration
 */
function _reduceArray(task, context) {
	var list = task.list;
	
	return function(idx) {
		task.result = task.fn.call(context, task.result, list[idx], idx, list);
	};
}

/**
 * Returns an iterator used to mimic [Underscore's map](http://underscorejs.org/#each) behavior on objects.
 * @private
 * 
 * @param {Task.Task} task The task that defines this iteration
 * @param {Object} context The context in which to execute each iteration
 */
function _eachDictionary(task, context) {
	var list = task.list,
		keys = task.keys;
	
	return function(idx) {
		var key = keys[idx];
		task.fn.call(context, list[key], key, list);
	};
}

/**
 * Returns an iterator used to mimic [Underscore's map](http://underscorejs.org/#map) behavior on objects.
 * @private
 * 
 * @param {Task.Task} task The task that defines this iteration
 * @param {Object} context The context in which to execute each iteration
 */
function _mapDictionary(task, context) {
	var list = task.list,
		keys = task.keys;
		
	return function(idx) {
		var key = keys[idx];
		task.result[key] = task.fn.call(context, list[key], key, list);
	};
}

/**
 * Returns an iterator used to mimic [Underscore's map](http://underscorejs.org/#reduce) behavior on objects.
 * @private
 * 
 * @param {Task.Task} task The task that defines this iteration
 * @param {Object} context The context in which to execute each iteration
 */
function _reduceDictionary(task, context) {
	var list = task.list,
		keys = task.keys;
		
	return function(idx) {
		var key = keys[idx];
		task.result = task.fn.call(context, task.result, list[key], key, list);
	};
}