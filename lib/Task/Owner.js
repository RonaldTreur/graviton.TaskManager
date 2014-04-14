var ClassManager = require('ClassManager'),
	Task = require('Task/Task'),
	IterationTask = require('Task/IterationTask');

/**
 * @class TaskOwner
 * 
 * Representation of task owner.
 */
ClassManager.define('TaskOwner', {
	/**
	 * @property {String} name Name assigned to this owner (not unique), purely for debugging purposes
	 */
	name: null,
	
	/**
	 * @property {Object} The owner's origin (context)
	 */
	origin: null,
	
	/**
	 * @property {Object} tasks Dictionary containing all tasks that are to be performed
	 */
	tasks: null,
	
	/**
	 * @property {Array} taskOrder Collection of task id's that need to be performed at some point (superset containing all tasks in order)
	 */
	taskOrder: null,
	
	/**
	 * {Task} liveTask The task currently executing (or scheduled for execution)
	 */
	liveTask: null,
	
	/**
	 * @property {Object} completedTasks Dictionary containing all tasks that have been performed
	 */
	completedTasks: null,
	
	/**
	 * Construct a new instance of this class
	 */
	construct: function(name, origin) {
		this.name = name;
		this.origin = origin;
		
		// Initialize the task collections
		this.tasks = {};
		this.completedTasks = {};
		
		this.taskOrder = [];
	},
	
	/**
	 * Add a new task to this owner.
	 * 
	 * Depending on the state
	 * 
	 * @param {Task/Task|Object} task A task instance or task definition
	 * @param {String} [task.id] (Locally) Unique ID of this task (only required if referenced)
	 * @param {Boolean} [task.activeOnly=false] True if the task only needs to be performed when owner is active
	 * @param {Object} [task.subTasks] Dictionary containing (ordered) subtasks
	 * @param {Object} [task.iterate] Iteration details for an IterationTask
	 * @param {Object|Array} [task.iterate.list] The array or dictionary to iterate over
	 * @param {Number} [task.iterate.step=1] The number of iterations to perform before checking for other tasks
	 * @param {Boolean} [immediate=false] True to perform this task as soon as possible, false otherwise
	 */
	add: function(task, immediate) {
		var config;
		
		if (!(task instanceof Task)) {
			if (task.iterate) {
				config = _.extend({}, task, task.iterate);
				delete config.iterate;
				task = new IterationTask(config);
			} else
				task = new Task(task);
		}
		
		this.tasks[task.id] = task;
		this.taskOrder.push(task.id);
	},
	
	/**
	 * Retrieve the task with the supplied id.
	 * 
	 * @param {String|Number} taskId The Task's id
	 * @return {Task.Task} The task, or null if not found (which implies it was never added)
	 */
	get: function(taskId) {
		return 	this.tasks[taskId] || 
				this.completedTasks[taskId] || 
				(this.liveTask && this.liveTask.id == taskId ? this.liveTask : null);
	},
	
	/**
	 * Denote a task (by id) as the task that is to be executed next.
	 * 
	 * @param {String|Number} taskId The Task's id
	 * @return {Boolean} True if this operation succeeded, false otherwise
	 */
	setNext: function(taskId) {
		var task = this.tasks[taskId];
		
		if (!task) {
			_log('Error: task not found (setNext)');
			return false; // Task does not exist, is already active, or has already been completed
		}
		
		// Remove the task from this owner's todo-list
		if (!_removeTask(this, taskId)) {
			_log('Error: task not removed (setNext)');
			return false;
		}
		
		this.liveTask = task;
		return true;
	},
	
	/**
	 * Retrieve this owner's next task.
	 * 
	 * The task is immediately removed from memory, so it has to be executed.
	 * 
	 * @param {Boolean} isActive True if this owner is currently active, false otherwise
	 * @return {Task} The next task to perform, or null if no (valid) task exists (anymore)
	 */
	getNext: function(isActive) {
		// Return early if there are no tasks left
		if (!this.taskOrder.length)
			return null;
		
		var taskId, task, i, ln;
		
		if (isActive) {
			taskId = this.taskOrder.shift();
		} else {
			for (i = 0, ln = this.taskOrder.length; i < ln && !taskId; i++) {
				task = this.tasks[this.taskOrder[i]];
				if (!task.activeOnly) {
					taskId = this.taskOrder.splice(i, 1);
				}
			}
			
			if (!taskId) {
				_log('['+this.name+ ']: No task left in this owner');
				return null; // No valid task left
			}
		}
		
		task = this.tasks[taskId];
		delete this.tasks[taskId];
		this.liveTask = task;
		
		_log('['+this.name+ ']: New task found '+task.name || '<no name>');
		return task;
	},
	
	/**
	 * Mark the supplied task as completed (provided this owner was aware of its execution)
	 * 
	 * @param {Task} task The task that was completed
	 * @param {Boolean} manualOverride True if this task was performed in an alternative fashion, false otherwise
	 */
	completed: function(task, manualOverride) {
		var i, ln;
		
		_log('completed: '+task.name);
		if (manualOverride) {
			// Remove the task from this owner's todo-list
			_removeTask(this, task.id);
			Ti.API.info('1A');
		} else if (task != this.liveTask) {
			Ti.API.info('2A');
			return; // This owner was not responsible for execution of this task
		}
			
		this.completedTasks[task.id] = task;
	},
	
	/**
	 * Check if this owner contains pending tasks
	 * 
	 * @return {Boolean} True if this owner still contains tasks, false otherwise
	 */
	hasPending: function() {
		return !!this.taskOrder.length;
	},
	
	/**
	 * Remove all tasks and wind down
	 */
	destroy: function() {
		// Pass the word
		this.liveTask && this.liveTask.destroy();
		_destroyTasks(this.tasks);
		// Clear memory (just to be sure)
		this.tasks = null;
		this.taskOrder = null;
		this.completedTasks = null;
	}
}, module);

/**
 * @property {Function} _log Log the supplied message
 * @private
 */
var _log = Ti.API.info;

/**
 * Destroy all pending tasks.
 * 
 * @param {Object} Dictionary containing all inactive & uncompleted tasks
 */
function _destroyTasks(tasks) {
	var id;
	
	for (id in tasks) {
		tasks[id].destroy();
	} 
}

/**
 * Remove a task from its owner's todo-list.
 * 
 * @param {Task/Owner} owner The owner of the task
 * @param {String} taskId The id of the task to remove
 * @return {Boolean} True if the operation succeeded, false otherwise
 */
function _removeTask(owner, taskId) {
	var found = false,
		i, ln;
	
	for (i = 0, ln = owner.taskOrder.length; i < ln && !found; i++) {
		if (owner.taskOrder[i] == taskId) {
			owner.taskOrder.splice(i, 1);
			_log('remove: task  found');
			found = true;
		}
	}
	
	if (!found)
		return false; // This should never happen! Throw an exception
	
	delete owner.tasks[taskId];
	return true;
}
