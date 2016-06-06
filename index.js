var prompt = require('prompt'),
		cliff = require('cliff'),
		Spinner = require('cli-spinner').Spinner,
		async = require('async'),
		colors = require('colors/safe'),
		Dashboard = require('./dashBoard'),
		trelloController = require('./trelloController'),
		writeFile = require('./writeFileController'),
		promptConstants = require('./promptConstants');

/* ::: CONTROL LOGIC :::
*	 1). Welcome displayed
*	 2). User is prompted for username and tag to search boards on trello account
*  3). User enters username and tag
*  4). After input, new dashBoard is created with username and tag
*  5). Script calls trello api to get all boards for username with given tag name
*  6). Result of 6 is an array of boards that is assigned to dashBoard.boards
*  7). For each board in dashBoard.boards, script calls trello api to get a board's list
*  8). Result of 7 is assigned to dashBoard.boards[board_id].lists for a given board_id
*  9). For each list in 8 script calls trello api to get a list's tasks.
* 10). Result of 9 is assigned to dashBoard.boards[board_id][list_id].tasks for a given board_id and list_id.
* 11). User is displayed all board names with an index in addition to the respective amount of lists for each board
* 12). User is prompted to input a board_id to view a specific board
* 13). After input, script calls trello api for all the tasks for the board specfied in 12
* 14). Result of 13 is assigned to dashBoard[board_id][list_id][task_id].actions for a given board_id, list_id, and task_id
* 15). Report is generated in folder reports/[time_stamp]/[board_name].csv for board selected in 12 with all lists and tasks and date of completed tasks
* 16). User prompt appears to continue application
*	17). If user enters y, application will go to state 11 -- report will be generated in same folder as 15 with a different board_name
*/

/* ::: FUNCTION CALLS :::
* start <-----------------------------------------------
* 	--> createDashBoard (username, tag)                |
*			--> displayBoardList (dashBoard)                 | 
*				--> getActionsForTasks (dashBoard, board_id)   |
*					--> displayBoard (dashBoard, board_id) ------
* 				--> writeFile (dashBoard, board_id)    

*/


/*----------  start script  ----------*/
// Loading spinner
var spinner = new Spinner('creating your dashboard.. %s');
spinner.setSpinnerString('|/-\\');

// welcome prompt
console.log(promptConstants.welcome);
prompt.start();

// ask user for username and tag input
console.log(promptConstants.username_tag_prompt);
prompt.get(['username', 'tag'], function(err, result) {
	if(err) {
		console.log(err);
		return;
	} 
	// start loading spinner
	spinner.start();
	createDashBoard(result.username, result.tag);
});

/*=================================================
=            dashBoard build functions            =
=================================================*/

/*----------  function to get actions (dates of completed tasks) for a specific board from user input  ----------*/
var createDashBoard = function(username, tag) {
	// create new Dashboard with input username and input tag name
	var dashBoard = new Dashboard(result.username, result.tag);
	// trello api call
	trelloController.getBoardsForUser(result.username, result.tag).then(function(result) {
		// set boards property on dashBoard to be equal to the result of api call (array of boards)
		dashBoard.boards = result;
		// get lists for each board in dashBoard.boards
		async.map(dashBoard.boards, trelloController.getListsForBoard, function(error, result) {
			if(error) {
				console.log(error);
				return;
			}
			// iterate over each board
			async.each(dashBoard.boards, function(element, callback){
				// get tasks (or cards) for each list in dashBoard.board[element];
				async.map(element.lists, trelloController.getTasksForList, function(error, result) {
					if(error) {
						return callback(error, null);
					} else {
						// set boards.list equal to array of tasks
						element.lists = result;
						return callback(null, element);
					}
				});
				// error handler for async.each()
			}, function (error) {
				if(error) {
					console.log(error)
					return;
				}
				// stop spinner 
				spinner.stop(true);
				// call displayBoardList with the current dashBoard -- see display funtions section
				displayBoardList(dashBoard); // dashBoard WITHOUT actions for each task
			});
		});
	});
}

var getActionsForTasks = function (dashBoard, board_id) {
	async.each(dashBoard.boards[board_id].lists, function (element, callback){
		async.map(element.tasks, trelloController.getActionsForTask, function (error, result) {
			if(error) {
				return callback(error, null);
			} else {
				element.tasks = result;
				// console.log(element.tasks)
				return callback(null, element);
			}
		});
	}, function (error) {
		if(error) {
			console.log(error);
		} else {
			displayBoard(dashBoard, board_id); // dashBoard is in its final state
			writeFile(dashBoard, board_id);
		}
	});
}

/*=====  End of dashBoard build functions  ======*/


/*=========================================
=            Display Functions            =
=========================================*/

/*----------  prompt/input function for to get actions (dates for completed tasks) for each task (or card) ----------*/
// dashBoard parameter is an object with dashBoard.boards
var displayBoardList = function(dashBoard) {
	if (!dashBoard.boards) {
		console.log('boards not found. ');
		process.exit(-1);
	}
	// display dashboard name
	console.log(promptConstants.dashboard_header(dashBoard));
	// display header for list of boards
	console.log(promptConstants.boards_header);
	// log each board in dashBoard.boards
	dashBoard.boards.forEach(function (element, index) {
		console.log(promptConstants.board_list(element, index));
	});
	// user input for board choice
	console.log('\n'+ colors.yellow('enter the number of the board you want to view:'))
	prompt.get(['board_id'], function (err, result) {
		if (err) {
			console.log(error);
		} else {
			// get actions for each list in dashBoard[result.board_id] -- see dashboard builder sections
			getActionsForTasks(dashBoard, result.board_id)
		}
	});
}


/*----------  prompt display function to display lists and tasks of a specific board  ----------*/

// takes a dashBoard object and a board number (index of dashBoard.boards)
var displayBoard = function(dashBoard, board_id) {
	// console board header
	console.log(promptConstants.board_name(dashBoard, board_id));
	// console color legend
	console.log(promptConstants.color_legend)
	// for list in board
	dashBoard.boards[board_id].lists.forEach(function (element, index){
		// log list name
		console.log(promptConstants.list_name(element, index))
		// closure variables to track completed tasks and completion date
		var completed = '';
		var dateCompleted = '';
		// for each task in lists
		element.tasks.forEach(function(element){
			// check if task is complete
			if(element.badges.checkItemsChecked === 1) {
				// if task in complete, assign completed to check
				completed = '✔';
				// find date of completiong for specific action
				var action = element.actions.filter(function (element) {
					return element.type = 'updateCheckItemStateOnCard';
				});
				// set dateCompleted closure variable
				dateCompleted = new Date(action[0].date).toLocaleString() // TODO: fix for IE8
			} else {
				// if task is not complete, set complete to x
				completed = '✖';
				// no completion date
				dateCompleted = '';
			}

			// map label name to each item in element.labels
			element.labels = element.labels.map(function (element){
				return element.name;
			});

			// check if task is required (has required label)
			if(element.labels.indexOf('Required') >= 0) {
				// remove 'required' label from array
				element.labels.splice(element.labels.indexOf('Required'), 1)
				// log task with green color
				console.log(promptConstants.task_required(element, completed, dateCompleted));
			} 
			// check if task is optional or recommended
			else if (element.labels.indexOf('Recommended') >=0) {
				// remove 'recommended' label from array
				element.labels.splice(element.labels.indexOf('Recommended'), 1)
				// log task with yellow color
				console.log(promptConstants.task_recommended(element, completed, dateCompleted));
			} else {
				// if unassigned (neither required or recommended), log task with magenta color
				console.log(promptConstants.task_unassigned(element, completed, dateCompleted));
			}
		});
		console.log('\n');
	});

	console.log('exported .csv file to reports folder')
	console.log('press y to go back to board list...')

	// recursive input to continue or exit
	prompt.get(['continue'], function (err, result) {
		if(err) {
			console.log(error)
		} else {
			if(result.continue === 'y') {
				displayBoardList(dashBoard);
			}
		}
	})
}


/*=====  End of Display Functions  ======*/

/*----------  Board list display function  ----------*/




