var ClassManager = require('ClassManager');

/**
 * @class Task.Task
 * 
 * Representation of task.
 */
var Task = ClassManager.define('Task.Task', {
	/**
	 * @property {String|Number} id The (locally) unique ID of the Task
	 */
	id: null,
	
	/**
	 * @property {Function} fn The function that is to be invoked by this Task
	 */
	fn: null,
	
	/**
	 * @property {Array} [arguments] Arguments that will be passed to fn upon invocation 
	 */
	arguments: null,
	
	/*
	 * @property {String} [name] Name used with logging or debugging
	 */
	name: '',
	
	/**
	 * @property {Boolean} activeOnly True if this task should only be performed when its Owner is active, false otherwise
	 */
	activeOnly: 0,
	
	/**
	 * @property {Object} context The context in which to execute this task
	 */
	context: null,
	
	/**
	 * @property {Array} subTasks Sorted array containing sub tasks that need to be invoked
	 */
	subTasks: null,
	
	/**
	 * @property {Mixed} result The result of the task, or the intermediate result of a serial subtask if still being executed
	 */
	result: null,
	
	/**
	 * @property {Function} callback Function to call once the Task has been performed
	 */
	callback: null,
	
	/**
	 * @property {String} state The current state of this task
	 * @readonly
	 */
	state: null,

	statics: {
		/**
		 * @property {Object} state Dictionary containing the various states a Task can be in.
		 * @property {String} state.PENDING This task has yet to be performed
		 * @property {String} state.ACTIVE This task is currently being executed
		 * @property {String} state.COMPLETE This task has been completed 
		 * @property {String} state.CANCELLED This task was cancelled
		 * @property {String} state.PAUSED This task was paused
		 * @static
		 */
		state: {
			PENDING: 'pending',
			ACTIVE: 'active',
			COMPLETE: 'complete',
			CANCELLED: 'cancelled',
			PAUSED: 'paused'
		}
	},
	
	/**
	 * Construct a new instance of this class.
	 * @constructor
	 * 
	 * @param {Object} config The configuration details for this Task
	 * @param {String|Number} [config.id] Unique id by which to reference this task
	 * @param {Function} config.fn The function that is to be performed when executing this task
	 * @param {Object} [config.context] The context in which to execute (if different from owner)
	 * @param {Array} [config.arguments] Arguments passed to the fn 
	 * @param {Function} [config.callback] A function that will be called as soon as the task has been performed
	 * @param {Boolean} [config.activeOnly=false] True if this task should only be performed while the owner is active,
	 *  false otherwise.
	 */
	construct: function(config) {
		this.fn = config.fn;
		
		if (config.arguments) {
		 	this.arguments = _.isArray(config.arguments) ? config.arguments : [config.arguments];
		} else
			this.arguments = [];
		
		this.activeOnly = !!config.activeOnly;
		this.id = config.id || _taskIdCounter++;
		
		config.name && (this.name = config.name);
		config.context && (this.context = config.context);
		config.callback && (this.callback - config.callback);
		config.subTasks && (this.subTasks = config.subTasks);
		
		this.state = this.statics.state.PENDING;
	},
	
	/**
	 * Execute this task.
	 * 
	 * Note that toggling manualOverride has no impact on standard tasks with no subtasks.
	 * 
	 * When manualOverride is toggled to true, this task is executed asap and any subtasks it contains won't be deferred. 
	 * Instead they are run back-to-back until they're all finished.
	 * 
	 * @param {Task.Owner} owner The owner that defines the context in which this task is executed (unless bound to a context when created)
	 * @param {Function} next Function that tells the TaskManager to schedule the next task
	 * @param {Boolean} [manualOverride=false] True if called outside of the normal flow of TaskManager, false otherwise
	 */
	execute: function(owner, next, manualOverride) {
		if (this.state == this.statics.state.ACTIVE || this.state == this.statics.state.COMPLETE)
			return this.result; // This should never happen (but make sure to never execute twice)

		this.state = this.statics.state.ACTIVE;
		// Execute
		this.result = this.fn.apply(this.context || owner.origin, this.arguments);
		// We expect serial behavior, so at this point the task has completed
		this.state = this.statics.state.COMPLETE;
		
		// Alert this task's owner
		owner.completed(this, manualOverride);
		// Invoke the (optional) callback
		this.callback && this.callback(this.result);
		// Continue
		next(this.result);
	},
	
	/**
	 * Check if this task has been completed
	 * 
	 * @return {Boolean} True if complete, false otherwise
	 */
	isComplete: function() {
		return this.state == this.statics.state.COMPLETE;
	},
	
	/**
	 * Pause this task if it has not yet been performed.
	 * 
	 * Pausing a task will prevent it from executing until reactivated.
	 */
	pause: function() {
		if (this.state != this.statics.state.COMPLETE)
			this.state = this.statics.state.PAUSE;
	},
	
	/**
	 * Gracefully destroy this task and remove it from memory
	 */
	destroy: function() {
		// Change state first in case we're live
		if (this.state != this.statics.state.COMPLETE)
			this.state = this.statics.state.CANCEL;
		
		this.arguments = null;
		this.fn = null;
		this.context = null;
		this.result = null;
		this.callback = null;
	} 
}, module);
 
/**
 * @property {Number} _taskIdCounter Counter used to generate unique task id's
 * @private
 */
var _taskIdCounter = 0,

/**
 * @property {Function} _log Log the supplied message
 * @private
 */
	_log = Ti.API.info;