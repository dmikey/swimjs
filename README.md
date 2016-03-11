# SwimJS

`swimjs` is a JavaScript runtime for the [Swim](https://github.com/swimit/swim)
platform.  Swim makes it easy to build realtime applications that transcend
client and server.  Create cloud services that mirror client features, and
drop-in view controllers that automatically synchronize with the cloud.
If you can register an event handler, you can architect a realtime app with
Swim.  

If you'd like a better understanding of how Swim works, you can find out more [here](https://github.com/swimit/swim).

## Installation

### Mac

`swimjs` for Mac installs using [Homebrew](http://brew.sh/).

```sh
brew tap swimit/swim
brew install swimjs
```

### Linux

`swimjs` is available as a `deb` package for Linux systems. Swim requires Java8, please ensure that Java 8 is your default java version.

```sh
gpg --keyserver pgpkeys.mit.edu --recv-key 7015E74D1C9EB5D6
gpg -a --export 7015E74D1C9EB5D6 | sudo apt-key add -
echo "deb https://repo.swim.it/swim-deb swim main" | sudo tee -a /etc/apt/sources.list
sudo apt-get update
sudo apt-get install swimjs
```

### Windows

Download [swimjs for Windows](https://repo.swim.it/swim-universal/swimjs-0.1.0-alpha1.zip). Uncompress the zip file into an appropriate directory. Add the file called swimjs.bat under the swimjs/bin directory to your Windows PATH variable. Swim requires Java8 which can be downloaded from [here](http://www.oracle.com/technetwork/java/javase/downloads/jdk8-downloads-2133151.html).

## Getting Started

The easiest way to understand Swim is to start building an app.  Check out
the [SwimJS API docs](API.md), and the
[Swim JavaScript client docs](https://github.com/swimit/swim-client-js), for
descriptions on the APIs used in these examples.

### To-Do App

Let's build a basic To-Do list app with real-time synchronization between
users.  First we'll build the server side of the app.  Create a file named
`todo.js` and paste in the code below.  We'll tall about what this code does
in a minute.

```js
var service = require('swim-service-js');
var todo = new service.ListLane().register('todo/list');
if (todo.isEmpty()) {
  todo.push({item: 'Chips'});
  todo.push({item: 'Salsa'});
}
```

Next we'll build the UI.  Paste the HTML below into a file called `todo.html`.
Put the file in the same directory as `todo.js`.  We'll explain the Swim parts
shortly; most of this is standard [AngularJS](https://angularjs.org)
boilerplate.

```html
<!DOCTYPE html>
<html ng-app="todo">
  <head>
    <meta charset="UTF-8">
    <title>To-Do</title>
  </head>
  <body ng-controller="TodoList">
    <h1>To-Do</h1>
    <ul>
      <li ng-repeat="item in items.state">
        <input type="checkbox" ng-model="item.checked" ng-change="check($index)"/>
        <span>{{item.item}}</span>
      </li>
    </ul>
    <form ng-submit="add()">
      <input type="text" placeholder="To-Do" ng-model="newItem"/>
      <input type="submit" value="Add"/>
    </form>
    <script src="https://ajax.googleapis.com/ajax/libs/angularjs/1.5.0/angular.min.js"></script>
    <script src="https://repo.swim.it/swim/recon-0.3.9.js"></script>
    <script src="https://repo.swim.it/swim/swim-client-0.4.5.js"></script>
    <script>
      var app = angular.module('todo', []);
      app.controller('TodoList', function ($scope) {
        $scope.items = swim.downlink()
          .node('ws://localhost:5619/todo/grocery')
          .lane('todo/list')
          .onEvent(function (message) {
            $scope.$apply(); // Update the view.
          })
          .syncList();
        $scope.add = function () {
          $scope.items.push({item: $scope.newItem});
          $scope.newItem = '';
        };
        $scope.check = function (index) {
          $scope.items.set(index);
        };
      });
    </script>
  </body>
</html>
```

We're almost ready to run the app.  The last thing we need to do is add a
file called `swim.recon` with our server configuration.  We'll get into the
details after we get the app up and running.  Create a `swim.recon` file in
the same directory as `todo.js`, and paste in the following:

```recon
@server {
  port: 5619
  store: "todo.store"
  @route {
    prefix: "/todo/"
    service: "todo"
  }
}
@service {
  name: "todo"
  main: "todo.js"
}
```

Let's fire it up.  Open a terminal and navigate to the directory with the
files you just created.  Start the SwimJS server by running `swimjs` on the
command line.  Then open `todo.html` in multiple browser windows.

![To-Do App](images/todo.png)

Let's explore what we did. 

We started a `swimjs` server that gets its instructions from the
[`swim.recon`](API.md#swimrecon-file) file in the current directory.  The
`swim.recon` file says that the server should listen for connections on port
`5619`, and store data in a file called `todo.store`.  It also defines a
`@route`, which states that URI paths that begin with `/todo/` should map to a
service class named `todo`.

```recon
@server {
  port: 5619
  store: "todo.store"
  @route {
    prefix: "/todo/"
    service: "todo"
  }
}
```

The `swim.recon` file then goes on to declare the `@service` named `todo`,
specifying that the `todo` service is defined in a file called `todo.js`.

```recon
@service {
  name: "todo"
  main: "todo.js"
}
```

The net result is that every URI path on our Swim server that starts with
`/todo/` refers to a unique instance of our `todo.js` service.

In the `todo.js` service, we created a `ListLane` and named it `todo/list`.
A `ListLane` stores a sequence of values, and publishes change events to
linked clients.

```js
var todo = new service.ListLane().register('todo/list');
```

On the client, we synchronized the `todo/list` lane of `/todo/grocery`
service, and populated the UI with the items in the list.  Swim synchronizes
data by creating downlinks.  A downlink is a subscription to the events
published by a lane.  Whenever the list changes on the server, the downlink
updates the client.  In Swim terminology, a `node` is the URI of a particular
Swim service instance.

```js
$scope.items = swim.downlink()
  .node('ws://localhost:5619/todo/grocery')
  .lane('todo/list')
  .onEvent(function (message) {
    $scope.$apply(); // Update the view.
  })
  .syncList();
```

We also defined an `add` function that appends a new item to the list.  Adding
an item to a downlink automatically pushes the change to the linked Swim
 service.

```js
$scope.add = function () {
  $scope.items.push({item: $scope.newItem});
  $scope.newItem = '';
};
```

If you open multiple browser windows, you'll see that when you change the list
in one window, the other windows update instantaneously.

### Chat App

How about we build a chat app next?  Create a new directory and add a
`chat.js` file with the server-side code below:

```js
var service = require('swim-service-js');

var room = new service.TailLane(function (message) {
  // Delete chat messages after 1 minute.
  return Date.now() - (message.time || 0) > 60 * 1000;
}).register('chat/room');
room.onCommand = function (message, uplink) {
  // Insert time into posted chat messages.
  var chatMessage = {
    time: Date.now(),
    text: message.body.text
  };
  console.log(new Date(chatMessage.time) + ': ' + chatMessage.text);
  room.push(chatMessage);
};

setInterval(function () {
  // Check in on the chatroom every 30 seconds.
  if (room.isEmpty()) {
    console.log('Where did everybody go?');
    room.push({
      time: Date.now(),
      text: 'Is anybody here?'
    });
  }
}, 30 * 1000);
```

Then create `chat.html` and fill it with the following simple chat UI:

```html
<!DOCTYPE html>
<html ng-app="chat">
  <head>
    <meta charset="UTF-8">
    <title>Chat</title>
  </head>
  <body ng-controller="ChatRoom">
    <h1>Chat</h1>
    <ul>
      <li ng-repeat="message in messages.state">
        <strong>{{message.time | date:'h:mm:ss a'}}</strong>
        <span>{{message.text}}</span>
      </li>
    </ul>
    <form ng-submit="post()">
      <input type="text" placeholder="Message" ng-model="newMessage"/>
      <input type="submit" value="Post"/>
    </form>
    <script src="https://ajax.googleapis.com/ajax/libs/angularjs/1.5.0/angular.min.js"></script>
    <script src="https://repo.swim.it/swim/recon-0.3.9.js"></script>
    <script src="https://repo.swim.it/swim/swim-client-0.4.5.js"></script>
    <script>
      var app = angular.module('chat', []);
      app.controller('ChatRoom', function ($scope) {
        $scope.messages = swim.downlink()
          .node('ws://localhost:5619/chat/public')
          .lane('chat/room')
          .onEvent(function (message) {
            $scope.$apply(); // Update the view.
          })
          .syncList();
        $scope.post = function () {
          $scope.messages.command({text: $scope.newMessage});
          $scope.newMessage = '';
        };
      });
    </script>
  </body>
</html>
```

Next create a Swim server configuration for the chat app in a new `swim.recon`
file:

```recon
@server {
  port: 5619
  store: "chat.store"

  @route {
    prefix: "/chat/"
    service: "chat"
  }
}

@service {
  name: "chat"
  main: "chat.js"
}
```

Open a terminal, navigate to the directory with the files you just created,
and run `swimjs`.  Open `chat.html` in multiple browser windows, and start
chatting.

Let's go over what's new in the chat example, starting with the server side.
The lane we used for our chat room is called a `TailLane`.  Like a `ListLane`,
a `TailLane` stores a sequence of items, and publishes change events.  But a
`TailLane` uses a `dropWhile` function, passed to the lane's constructor, to
decide when to drop old messages.  In the case of our `chat/room` lane, we
drop messages after 1 minute.

```js
var room = new service.TailLane(function (message) {
  // Delete chat messages after 1 minute.
  return Date.now() - (message.time || 0) > 60 * 1000;
}).register('chat/room');
```

Next, we attach an `onCommand` callback to the `chat/room` lane.  A Swim
_command_ is like a method call on a lane.  We use commands on the `chat/room`
lane to post new messages to the chat room.  We make sure to insert the
current time into the message so that the lane's `dropWhile` function can
determine how old the message is.

```js
room.onCommand = function (message, uplink) {
  // Insert time into posted chat messages.
  var chatMessage = {
    time: Date.now(),
    text: message.body.text
  };
  console.log(new Date(chatMessage.time) + ': ' + chatMessage.text);
  room.push(chatMessage);
};
```

Lastly, we set a timer that fires every 30 seconds and posts a message to the
chat room, if there's no other activity.

```js
setInterval(function () {
  // Check in on the chatroom every 30 seconds.
  if (room.isEmpty()) {
    console.log('Where did everybody go?');
    room.push({
      time: Date.now(),
      text: 'Is anybody here?'
    });
  }
}, 30 * 1000);
```
