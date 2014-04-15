var ClassManager = require('ClassManager'),
	Task = require('Task/Task'),
	TaskOwner = require('Task/Owner');

/**
 * The TaskManager manages all tasks that are to be performed by the application.
 * 
 * 
 * 
 * @class TaskManager
 * @singleton
 */
var TaskManager = {
	/**
	 * Register a new task owner that will immediately become the active owner.
	 * 
	 * Since names need not to be unique, an id is created 
	 * and returned upon registration.
	 * 
  	 * @param {String} name Name of the task owner (not unique)
 	 * @param {Object} owner The task owner
 	 * @return {String} The identifier for this task owner
	 */
	register: function(name, owner) {
		var ownerId = 'o'+_ownerCounter++;
		
		_log('Registering new owner: '+name);
	
		// Create a new Task Owner
		_taskOwners[ownerId] = new TaskOwner(name, owner);
		// Add it to the top of the stack
		_taskOwnerStack.push(ownerId);
		// Mark it as active
		_activeTaskOwner = ownerId;
		
		return ownerId;
	},
	
	/**
	 * Unregister the task owner.
	 * 
	 * This will remove all pending tasks and remove this owner
	 * from memory completely. Make sure to call this whenever closing the 
	 * Owner, since it will linger on the stack indefinitely otherwise! 
	 * 
	 * @param {Number} ownerId The task owner identifier
	 */
	unregister: function(ownerId) {
		var i = _taskOwnerStack.length,
			found = false;
		
		if (!_taskOwners[ownerId])
			return; // It does not exist, so do nothing
		
		_taskOwners[ownerId].destroy();
		delete _taskOwners[ownerId];
		
		if (_activeTaskOwner == ownerId) {
			_taskOwnerStack.pop();
			_activeTaskOwner = _taskOwnerStack[_taskOwnerStack.length - 1];
		} else {
			while (i > 0 && !found) {
				if (_taskOwnerStack[--i] == ownerId) {
					_taskOwnerStack.splice(i, 1);
					found = true;
				}
			}
			_activeTaskOwner = _taskOwnerStack[_taskOwnerStack.length - 1];
		}
	},
	
	/**
	 * Activate a task owner so that it's tasks go to the top of the priority stack.
	 * 
	 * @param {String} ownerId The task owner identifier 
	 */
	activate: function(ownerId) {
		_activate(ownerId);
		
		this.check();
	},
	
	/**
	 * Add a new task to the supplied owner.
	 * 
	 * @param {String} ownerId Id of the owner this task is to be added to
	 * @param {Task.Task|Object|Array} task A task instance, description, or an array of thereof. See Task.Task#constructor 
	 */
	addTask: function(ownerId, task) {
		if (_.isArray(task)) {
			_.each(task, _taskOwners[ownerId].add, _taskOwners[ownerId]);
		} else 
			_taskOwners[ownerId].add(task);
		
		this.check(ownerId);
	},
	
	/**
	 * Require a task, or several tasks to be completed as soon as possible.
	 * 
	 * The tasks are performed in the order they are provided. Multiple calls to this function will append the new tasks to an internal queue.
	 * 
	 * If immediate is set to true, all tasks required will be performed non-stop before this method will return. In other words: invoking this
	 * function will block the execution thread all the way until callback has executed.
	 * If set to false, then only the priority of the required tasks is changed. 
	 * 
	 * When all required tasks have been perfomed the callback function (if provided) will be executed.
	 * 
	 * Note: If you unregister the owner before the required tasks were (all) performed, they won't be performed at all and the callback won't be executed either.
	 * If you need to get stuff done right away, before you can continue, set immediate to true.
	 * 
	 * @param {String} ownerId of the owner that contains the required task(s)
	 * @param {String|Array} taskId The (locally) unique ID of the task that is to be performed, or an array containing several of these
	 * @param {Object} [options] Dictionary with additional settings
	 * @param {Boolean} [options.immediate=false] True to execute the task(s) right now (synchronously), false to return to normal operation (asynchronously)
	 * @param {Function} [options.callback] The function to perform once all required tasks have been executed
	 * @param {Boolean} [options.passResults=false] True to pass the results of all tasks (as an array) to options.callback when it is executed, false otherwise
	 */
	requireTask: function(ownerId, taskId, options) {
		var result, performTask;
		
		!_.isArray(taskId) && (taskId = [taskId]);
		options || (options = {});
		
		if (options.immediate) {
			// Require the tasks to perform immediately.
			performTask = _.partial(_performImmediateTask, ownerId);
			result = options.passResults ? _.each(taskId, performTask) : _.map(taskId, performTask);
			option.callback && options.callback(result);
		} else {
			_log('Priority Task created');
			// Create a priority object that will be handled first
			_priorityStack.push({
				ownerId: ownerId,
				taskIds: taskId,
				callback: options.callback || false, 
				passResults: !!options.passResults,
				// Internal stuff
				results: [],
				currentIdx: 0
			});
			// In case we dozed of, get this done!
			this.check();
		}
	},
	
	/**
	 * Check if there are tasks that can be performed.
	 * 
	 * When no task is being executed currently, it will trigger the core mechanism to look for a valid task to perform.
	 * If found, this task will then be perfomed (deferred).
	 * 
	 * This method can be executed arbitrarily, but should at least be invoked when the active owner could change. 
	 * 
	 * @param {String} [activeOwnerId] If passed, then this owner will be activated first (see TaskManager#activate)
	 */
	check: function(activeOwnerId) {
		if (activeOwnerId && _activeTaskOwner != activeOwnerId) {
			_activate(activeOwnerId);
		}
		
		_running || _performTask();
	}
};

/**
 * @property {String} _activeInstance The ID of the last registered or activated task owner
 * @private
 */
var _activeTaskOwner = null,

/**
 * @property {Number} _ownerCounter The counter used for creating unique ID's
 * @private 
 */
	_ownerCounter = 1,

/**
 * @property {Object} _taskOwners All registered task owners
 * @private
 */
	_taskOwners = {},
	
/**
 * @property {Array} _taskOwnerStack The internal stack that directs the order in which task owner instances should have their tasks executed
 * @private
 */
	_taskOwnerStack = [],
	
/**
 * @property {Array} _priorityStack Stack of dictionaries that define request that are to be handled first.
 * 
 * A dictionary element consists of the following attributes:
 * - ownerId - The id of the owner of the tasks
 * - taskIds - Array containing task id's
 * - callback - Function (or null) that is to be performed when all tasks have been performed
 * - passResults - Boolean value; True to pass an array containing all results to the callback function
 * - results - Array containing the current returned results
 * 
 * @private
 */
	_priorityStack = [],
	
/**
 * @property {Boolean} _running True if the TaskManager is actively executing tasks at this moment, false otherwise
 * @private
 */
	_running = false,
	
/**
 * @property {Boolean} _debug True to run in debugging mode, false otherwise
 * @private
 */
	_debug = true;

/**
 * Reactivate a task owner so that it will have its tasks completed first.
 * @private
 * 
 * @param {String} ownerId The task owner identifier 
 */
function _activate(ownerId) {
	var i = _taskOwnerStack.length,
		found = false;
	
	if (!_taskOwners[ownerId])
		return; // It does not exist, so do nothing
		
	if (_activeTaskOwner == ownerId)
		return; // This owner is already the active owner
		
	while (i > 0 && !found) {
		if (_taskOwnerStack[--i] == ownerId) {
			_taskOwnerStack.splice(i, 1);
			_taskOwnerStack.push(ownerId);
			_activeTaskOwner = ownerId;
			found = true;
			_log('Activating new owner: '+_taskOwners[activeOwnerId].name);
		}
	}
}

/**
 * Perform the next task.
 * @private
 * 
 * The engine of TaskManager. This function checks owners (in order of priority)
 * for pending tasks and executes the first returned. Before it checks the owners however,
 * it first checks the priority stack. When a task is required (asynchronously) it ends up on this stack.
 */
function _performTask() {
	// If a priority task can be performed, make sure to get that done first
	if (_performPriorityTask()) {
		_running = true;
		return;
	}
	
	// Now make sure there are task owners (still) registered
	if (!_taskOwnerStack.length) {
		_running = false;
		return;
	}
	
	var owner = _taskOwners[_activeTaskOwner],
		task = owner.getNext(), // Pick the next task
		ownerNum = _taskOwnerStack.length,
		ownersChecked = 1;
	
	// If the active owner has no more tasks, traverse the other owners till one was found
	while (!task && ownersChecked != ownerNum) {
		// No task returned: deactivate this owner and move it to the bottom of the stack
		_taskOwnerStack.unshift(_taskOwnerStack.pop());
		ownersChecked++;
		
		// Activate the owner that came prior to the current one
		_activeTaskOwner = _taskOwnerStack[_taskOwnerStack.length - 1];
		owner = _taskOwners[_activeTaskOwner];
		task = owner.getNext(); // Pick the next task
	}
	
	// If no owner has any (relevant) tasks left, then shut down (for now)
	if (!task && ownersChecked == ownerNum) {
		_running = false;
		return;
	}
	
	_running = true;
	
	_log('['+owner.name+ ']: Scheduling task '+(task.name || '<no name>'));
	_.defer(_executeTask, task, owner); // Internal use of defer, not part of the actual mechanism deployed by TaskManager
}

/**
 * Perform a priority task if possible.
 * @private
 * 
 * @return {Boolean} True If a priority task will be performed next, false otherwise
 */
function _performPriorityTask() {
	if (!_priorityStack.length)
		return false;
		
	var request = _priorityStack[0],
		owner = _taskOwners[request.ownerId],
		currentIdx = request.currentIdx,
		taskNum = request.taskIds.length,
		taskId = request.taskIds[currentIdx],
		task = owner.get(taskId),
		completed = false;
		
	if (!task)
		return false; // This should not happen, throw an error
	
	while (task.isComplete() && !completed) {
		request.results.push(task.result);
		request.currentIdx = ++currentIdx;
		
		if (currentIdx < taskNum) {
			taskId = request.taskIds[currentIdx],
			task = owner.get(taskId);
		} else
			completed = true; 
	}// TODO: Check for active task as well
	
	if (completed) {
		// Remove this priority item/list
		_priorityStack.shift();
		
		// Invoke callback if assigned
		if (request.callback)
			request.passResults ? request.callback(request.results) : request.callback();
		
		return false;
	}
	
	_log('Priority Task found');
	
	// Execute
	if (owner.setNext(task.id)) {
		_log('['+owner.name+ ']: Scheduling priority task '+(task.name || '<no name>'));
		_.defer(_executeTask, task, owner); // Internal use of defer, not part of the actual mechanism deployed by TaskManager
		return true;
	} else
		return false; // TODO: Throw error and remove the priorityTask
}

/**
 * Perform the task passed immediately, blocking the thread. The task is performed outside
 * of the normal operation of this TaskManager.
 * @private
 * 
 * @param {String} ownerId The id of the owner that owns the task
 * @param {String} taskId The id of the task that is to be performed
 */
function _performImmediateTask(ownerId, taskId) {
	var owner = _taskOwners[ownerId],
		task;
		
	if (!owner)
		return;
		
	task = owner.get(taskId);
	
	if (!task)
		return;
	else if (task.isComplete())
		return task.result;
	
	_executeTask(task, owner, true);
}

/**
 * Execute the supplied task.
 * @private
 * 
 * This is a special function that is (normally) not called directly, but through _.defer. 
 * It executes the task assigned, and afterwards signals this TaskManager to move on to the next task.
 * 
 * The returnControl-parameter should only be set to true if execution of tasks is (temporarily) managed by another process.
 * For instance, when invoking TaskManager.requireTask with immediate set to true.
 * 
 * The callback argument is in addition to the (optional) callback defined in each task. It is only set in special circumstances
 * outside of normal operation.
 * 
 * @param {Task.Task} task The task that is to be executed
 * @param {Task.Owner} owner The owner that owns this task
 * @param {Boolean} [returnControl=false] True to step out of the normal operation and return control after execution, false otherwise
 * @param {Function} [callback] Additional callback that will be invoked when the task completes
 */
function _executeTask(task, owner, returnControl, callback) {
	var startTs, endTs;
		
	var next = function(result) {
		if (_debug) {
			endTs = +new Date();
			_log('['+owner.name+ ']: Finished task '+(task.name || '<no name>')+' in '+(endTs - startTs)+'ms'); // Add log data
		}
		
		callback && callback(result);
		
		// Process the next task unless overruled
		if (!returnControl) {
			_.defer(_performTask); // This defer is part of the actual mechanism. Once a Task is done, defer the selection of the next one.
		}
	};
	
	if (_debug) {
		startTs = +new Date();
		_log('['+owner.name+ ']: Starting task '+task.name || '<no name>');
	}
	
	// Execute the function	
	task.execute(owner, next, returnControl);	
}

/**
 * Log the supplied message.
 * 
 * @param {String} msg The message
 * @private
 */
function _log (msg) {
	Ti.API.info(msg + " (TaskManager)");
}

module.exports = TaskManager;