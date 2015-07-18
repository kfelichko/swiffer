var EventList = require('./eventList');
var actions = require('./actions');
var _ = require('underscore');
var retryStrategies = require('./retryStrategies');
var parameters = [
  // Already finished - nothing to do
  {
    task: {
      name: 'createOffer',
      type: 'activity'
    },
    list: [{
      "eventType": "ActivityTaskStarted",
      "activityTaskStartedEventAttributes": {
        "activityId": "createOffer",
      }
    }, {
      "eventType": "ActivityTaskCompleted",
      "activityTaskCompletedEventAttributes": {
        "activityId": "createOffer"
      },
    }],
    expect: []
  },
  // Not yet started. Schedule it
  {
    task: {
      name: 'newTask',
      type: 'activity'
    },
    expect: [new actions.ScheduleAction('newTask', undefined, {
      version: undefined
    })]
  },
  // Not yet started. Start the timer
  {
    task: {
      name: 'newTimer',
      type: 'timer',
      delay: 10
    },
    expect: [new actions.TimerAction('newTimer', 10)]
  },
  // Started, but not yet fired.
  {
    task: {
      name: 'myTimer',
      type: 'timer',
      delay: 10
    },
    list: [{

      "eventType": "TimerStarted",
      "timerStartedEventAttributes": {
        "control": "myTimer"
      },

    }],
    // Should be a "Noop" action
    expect: [{}]
  },
  // Started + fired. Do nothing
  {
    task: {
      name: 'myOtherTimer',
      type: 'timer',
      delay: 10
    },
    list: [{
      "eventType": "TimerStarted",
      "timerStartedEventAttributes": {
        "control": "myOtherTimer"
      }
    }, {
      "eventType": "TimerFired",
      "timerFiredEventAttributes": {
        "control": "myOtherTimer"
      }
    }],
    expect: []
  },

  // Start timer and fill in dynamic config from previous result
  {
    task: {
      name: 'newTimer',
      type: 'timer',
      delay: '$previousActivity.someResult'
    },
    list: [{
      "eventType": "ActivityTaskCompleted",
      "activityTaskCompletedEventAttributes": {
        "activityId": "previousActivity",
        "result": JSON.stringify({
          "someResult": 30
        })
      }
    }],
    expect: [new actions.TimerAction('newTimer', 30)]
  },

  // Scheduling failed. Fatal
  {
    task: {
      name: 'badConfigActivity',
      type: 'activity'
    },
    list: [{
      "eventType": "ScheduleActivityTaskFailed",
      "scheduleActivityTaskFailedEventAttributes": {
        "activityId": "badConfigActivity",
        "cause": "SOMETHING WENT WRONG"
      }
    }],
    expect: [new actions.FatalErrorAction("SOMETHING WENT WRONG", undefined)]
  },
  // Activity failed. Retry strategy says try again right away.
  {
    task: {
      name: 'failedActivity',
      type: 'activity',
      retryStrategy: new retryStrategies.Immediate(10)
    },
    list: [{
      "eventType": "ActivityTaskFailed",
      "activityTaskFailedEventAttributes": {
        "activityId": "failedActivity"
      }
    }],
    expect: [new actions.ScheduleAction('failedActivity', undefined, {
      version: undefined
    })]
  },

  // Activity failed. Retry strategy says try again in 10 seconds
  {
    task: {
      name: 'failedActivity',
      type: 'activity',
      retryStrategy: new retryStrategies.ConstantBackoff(10, 10)
    },
    list: [{
      "eventType": "ActivityTaskFailed",
      "activityTaskFailedEventAttributes": {
        "activityId": "failedActivity"
      }
    }],
    expect: [new actions.TimerAction('failedActivity__backoff', 10)]
  },

  // Activity failed and backoff timer fired. Reschedule. (These need timestamps to determine if the timer fired was after the failed)
  {
    task: {
      name: 'failedActivity',
      type: 'activity',
      retryStrategy: new retryStrategies.ConstantBackoff(10, 10)
    },
    list: [{
      "eventType": "ActivityTaskFailed",
      "eventTimestamp": "2015-07-14T02:38:17.767Z",
      "activityTaskFailedEventAttributes": {
        "activityId": "failedActivity"
      }
    }, {
      "eventType": "TimerFired",
      "eventTimestamp": "2015-07-14T02:39:17.767Z",
      "timerFiredEventAttributes": {
        "control": "failedActivity__backoff"
      }
    }],
    expect: [new actions.ScheduleAction('failedActivity', undefined, {
      version: undefined
    })]
  },
  // Activity failed twice and last backoff timer fired. Retry limit is 2, so fatal.
  {
    task: {
      name: 'failedActivity',
      type: 'activity',
      retryStrategy: new retryStrategies.ConstantBackoff(10, 2)
    },
    list: [{
      "eventType": "ActivityTaskFailed",
      "eventTimestamp": "2015-07-14T02:37:17.767Z",
      "activityTaskFailedEventAttributes": {
        "activityId": "failedActivity"
      }
    }, {
      "eventType": "ActivityTaskFailed",
      "eventTimestamp": "2015-07-14T02:38:17.767Z",
      "activityTaskFailedEventAttributes": {
        "activityId": "failedActivity"
      }
    }, {
      "eventType": "TimerFired",
      "eventTimestamp": "2015-07-14T02:39:17.767Z",
      "timerFiredEventAttributes": {
        "control": "failedActivity__backoff"
      }
    }],
    expect: [new actions.FatalErrorAction('Retry limit reached.')]
  }
];



var Task = require('./task');

describe('Task', function() {
  parameters.forEach(function(param, idx) {
    it('getNextActions - parameterized - #' + idx.toString(), function() {
      var task = new Task(param.task);
      expect(JSON.stringify(task.getNextActions(new EventList(param.list || [])))).toEqual(JSON.stringify(param.expect));
    });
  });
});