graviton.TaskManager
====================

Keep your Titanium Alloy application responsive by wrapping your logic into multiple Tasks that are then performed in order of (continuously updated) priority.

Warning
====================

This code is NOT yet tested and in this state useful for demonstration purposes only. That said, development will continue on a near-daily basis and this warning will be removed soon.

ToDo
====================

Primary tasks (in order):
 - Expand this readme (so you'll understand what this is all about)
 - Add code documentation (on a seperate page)
 - Add tests (using ti-mocha)
 - Streamline the code (asynchronize it and expand)


Known bugs:
- IterationTasks will not yet pause when a different owner is registered midway. However, they do allow for user interaction to take place while iterating.

Not yet Implemented:
- SubTasks
