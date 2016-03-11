# Swim JavaScript Services

## Contents

- [Overview](#overview)
- [JavaScript API](#javascript-api)
  - [Service](#service): the current Swim service instance.
  - [Lane](#lane): an addressable event source.
  - [User](#user): a user agent accessing the system.
  - [Uplink](#uplink): an inbound link connected to a lane of the current service.
  - [Downlink](#downlink): an outbound link connected to a lane of some other service.
  - [DownlinkBuilder](#downlinkbuilder): an object used to constructor outbound links.
- [JavaScript Runtime](#javascript-runtime)

## Overview

### Services

A Swim _service_ is a template for a stateful process that exposes real-time
event sources, and responds to streams of commands.  Swim services are
instantiated–Swim is designed to run millions of services simultaneously,
spanning clusters large and small, and bridging seamlessly between cloud and
edge devices.

Every Swim service instance has a persistent, universal address, expressed
as a URI.

### Lanes

Swim calls an event source bound to a service a _lane_.  Lanes are
also identified using URI notation.  Each Swim service instance has its own
set of Swim lanes.  Lanes come in several varieties, with different behaviors
and messaging semantics.  Many lanes transparently persist data within in the
Swim container, eliminating the need for an external database.  Swim solves
the problem of scaling stateful services; data stored within services simply
comes along for the ride.

### Links

Services connect to each other using _links_.  A Swim link is a subscription
to a lane of some service instance.  Swim links are resilient–they handle
the gory details of network congestion and flakiness for you, so you can focus
on your app.  Swim links are also multiplexed; Swim can maintain hundreds of
thousands of active links over a single TCP connection.

### Routes

A Swim _route_ is mapping from a set of URIs to a set of services.  Routes to
JavaScript services are declared in the [swim.recon file](#swim.recon-file).
Services are instantiated by resolving a URI to a service class using the set
of routes defined in the `swim.recon` file.  Services are lazily instantiated
by the JavaScript runtime.

### Clustering

Swim can seamlessly distribute sets of services across clusters of Swim
containers.  Clustering is completely transparent to services; Swim internally
rewrites service routes using a distributed hashing algorithm to map service
URIs to specific Swim containers.  Swim also takes care of replicating service
state, and failing over service routes in case of container failure.

Please contact swim.it if you would like to deploy a Swim cluster.

## JavaScript API

Think of a Swim service like a lightweight JavaScript process that manages
every operation that can be performed on a single URI.  Like a system process,
Swim services run continuously, and maintain state.  This differs from the
approach taken by most application servers, where a single process handles
many URIs, and little to no state is maintained between requests.

##### Contents

### Service

A Swim JavaScript service is defined by a JavaScript file that requires the
`swim-service-js` module.  To understand how services get instantiated, see
the section on the [JavaScript runtime](#javascript-runtime) environment.

```js
var service = require('swim-service-js');
```

#### service.hostUri

A service can access the base URI of the container that's currently running
the service through the `service.hostUri` property.

```js
console.log(service.hostUri); // e.g. swim://swim.example.com
```

#### service.nodeUri

The full URI of the current service is exposed at `service.nodeUri`.

```js
console.log(service.nodeUri); // e.g. swim://swim.example.com/chat/public
```

#### service.downlink()

Returns a new [DownlinkBuilder](#downlinkbuilder), which is used to establish
a new link to a lane of some service.

```js
var chat = service.downlink()
  .node('swim://swim.example.com/chat/public')
  .lane('chat/room')
  .prio(0.5)
  .keepAlive(true)
  .syncList();
```

#### service.command([hostUri, ]nodeUri, laneUri, body)

Sends a command to a lane of the service at `nodeUri`.  If provided,`hostUri`
specifies the network endpoint against which to resolve `nodeUri`.  `body` is
the plain-old JavaScript object to send; `body` is serialized as
[RECON](https://github.com/swimit/recon-js) when transported over the network.

```js
service.command('swim://swim.example.com/chat/public', 'chat/room', 'Hello, world!');
```

### Lane

A `Lane` represents an addressable event source bound to a service.  Each lane
manages a set of [uplink](#uplink) subscriptions to its event source.  Lanes
come in several varieties, with different messaging semantics and persistence
strategies.  All lanes support the core functionality defined in this section.
The Swim JavaScript runtime currently implements the following lane types:

- [CommandLane](#commandlane): receives only input commands.
- [SupplyLane](#supplylane): queues events for delivery to uplinks.
- [DemandLane](#demandlane): lazily generates events for delivery to uplinks.
- [JoinLane](#joinlane): aggregates many links into one lane.
- [ListLane](#listlane): persists an ordered list for synchronization with uplinks.
- [MapLane](#maplane): persists a key-value map for synchronization with uplinks.
- [TailLane](#taillane): persists a moving window of events.
- [ValueLane](#valuelane): persists a single value.

#### lane.register(laneUri)

Binds the `lane` to the current service.  Once registered, the `lane` is
addressable at node `lane.nodeUri` and lane `laneUri`.

```js
var chat = new service.ListLane().register('chat/room');
```

#### lane.nodeUri

The URI of the service to which the `lane` is bound.

```js
var chat = new service.ListLane().register('chat/room');
console.log(chat.nodeUri); // e.g. swim://swim.example.com/chat/public
```

#### lane.laneUri

The URI of the `lane` itself.

```js
var chat = new service.ListLane().register('chat/room');
assert.equal(chat.laneUri, 'chat/room');
```

### Lane Callbacks

Every lane supports a standard set of callback functions, which can be
overridden to specialize service behavior.  Lane callbacks are assigned as
delegate methods, rather than registered as event handlers.  Delegate methods
make it easier to reason about possible code paths, and simplify the process
of transitioning lanes between service states.

#### lane.onUplink = function (uplink)

The `onUplink` callback gets invoked when an incoming [Uplink](#uplink) is
registered with the `lane`.  `onUplink` can be used to assign `uplink`-specific
callbacks before any messages from the `uplink` are processed.

```js
var chat = new service.ListLane().register('chat/room');
chat.onUplink = function (uplink) {
  var linkTime = Date.now();
  uplink.onEvent = function (message, uplink) {
    var elapsedTime = Date.now() - linkTime;
    console.log('sending event after ' + elapsedTime + ' milliseconds');
  };
};
```

#### lane.onEnter = function (user)

The `onEnter` callback gets invoked when an authenticated [User](#user) links
to the `lane`, and the user has no existing links to the same lane of the same
service. This behavior makes `onEnter` useful for tracking user presence.

```js
var users = new service.MapLane().register('chat/users');
var chat = new service.ListLane().register('chat/room');
chat.onEnter = function (user) {
  users.set(user.email, {email: user.email, enterTime: Date.now()});
};
```

#### lane.onLeave = function (user)

The `onLeave` callback gets invoked when an authenticated [User](#user) unlinks
from the `lane`, and the user has no other links to the same lane of the same
service.  This behavior makes `onLeave` useful for detecting when users are
no longer present.

```js
var users = new service.MapLane().register('chat/users');
var chat = new service.ListLane().register('chat/room');
chat.onLeave = function (user) {
  users.delete(user.email);
};
```

#### lane.onCommand = function (message, info)

The `onCommand` callback gets invoked when the `lane` receives a command
`message`.  Sending a command to a lane is like invoking the lane as a method.
But instead of returning a result, the command callback may emit events on
its own lane, or on other lanes.

- `info.user`: the [User](#user) that sent the command.

The behavior of emitting events in response to commands, rather than returning
results, is central to the design of Swim.  Remote procedure calls cause
major consistency problems since clients don't observe the order in which
their calls are processed relative to other concurrent calls.  With Swim, if
a client needs to observe the result of command, it needs to link to the
lane before issuing the command.  This ensures that the client will maintain
a consistent view of the remote service.

```js
var chat = new service.ListLane().register('chat/room');
chat.onCommand = function (message, info) {
  chat.push({
    from: uplink.user.email,
    time: Date.now(),
    body: message.body
  });
};
```

#### lane.filterEvent = function (body, uplink)

The `filterEvent` callback gets invoked just before an event is dispatched to
an [Uplink](#uplink).  `body` contains the message itself.  The value returned
by `filterEvent` will be used as the actual message body sent to the uplink.
Use `filterEvent` to mask sensitive fields based on the `uplink.user`, or to
insert new fields that only the specific `uplink` should receive.

`filterEvent` is called immediately prior to writing an event to the network,
rather than when the event is queued to be sent.  This minimizes the latency
between when `filterEvent` is called, and when the client receives the event.
Use a [DemandLane](#demandlane) if you would like to completely defer message
generation until the network is ready to transport an event.

```js
var users = new service.MapLane().register('chat/users');
var chat = new service.ListLane().register('chat/room');
chat.filterEvent = function (body, uplink) {
  // Insert the poster's latest post count.
  recon.set(body, 'postCount', user.get(body.from).postCount);
  return body;
};
```

#### lane.onEvent = function (message, uplink)

The `onEvent` callback gets invoked just before an event `message` is
dispatched to an [Uplink](#uplink).  `onEvent` observes the exact message that
will be sent, including any transformations made by `filterEvent`.  `onEvent`
can't modify the `message`, its role is strictly to observe.

```js
var announce = new service.SupplyLane().register('chat/announce');
announce.onEvent = function (message, uplink) {
  service.log('Telling ' + uplink.user + ' about ' + message.body);
};
```

#### lane.onLink = function (request, uplink)

The `onLink` callback gets invoked when an [Uplink](#uplink) requests a
subscription to the `lane`.  If the uplink requests a synchronized
subscription, then `onLink` will _not_ be called; `onSync` will be called
instead.

#### lane.onLinked = function (response, uplink)

The `onLinked` callback gets invoked when the `lane` responds to the
[Uplink](#uplink) that a new link has been established.

#### lane.onSync = function (request, uplink)

The `onSync` callback gets invoked when an [Uplink](#uplink) requests a
synchronized subscription to the `lane`, meaning the uplink wants to subscribe
to the lane and receive an initial batch of events containing the current
state of the lane.

#### lane.onSynced = function (response, uplink)

The `onSynced` callback gets invoked when the `lane` responds to the
[Uplink](#uplink) that all state events have been sent, and the uplink is now
fully synchronized.  The uplink will continue to receive additional events as
they occur.

#### lane.onUnlink = function (request, uplink)

The `onUnlink` callback gets invoked when an [Uplink](#uplink) requests to
unsubscribe from the `lane`.

#### lane.onUnlinked = function (response, uplink)

The `onUnlinked` callback gets invoked when the `lane` responds to the
[Uplink](#uplink) that the uplink's subscription has been cancelled, either
because the uplink requested the unlink, or because the lane decided on its
own to close the link.  `onUnlinked` is also called when the lane rejects a
subscription request.

### CommandLane

A `CommandLane` receives command messages without emitting any events of its
own.  Command lanes are useful for implementing "helper methods" that control
other lanes.

#### new service.CommandLane([onCommand])

Instantiates a new `CommandLane` with an optionally provided on `onCommand`
callback.  A new `onCommand` callback can assigned to the returned
`CommandLane` at any time.

```js
var chat = new service.ListLane().register('chat/room');
var nuke = new service.CommandLane().register('chat/nuke');
nuke.onCommand = function (message, info) {
  if (info.user.get('superuser')) {
    service.log('Going nuclear on ' + service.nodeUri);
    chat.clear();
  }
};
```

### SupplyLane

A `SupplyLane` queues events for dispatch to uplinks.  Supply lanes don't
persist any state; they drop uplink queues when uplinks unlink, and when the
service restarts.

#### supplyLane.push(body)

Queues a message for dispatch to all currently linked uplinks.

```js
var announce = new service.SupplyLane().register('chat/announce');
announce.onCommand = function (message, uplink) {
  // Echo the command with info about the sender
  announce.push({
    from: uplink.user.email,
    text: message.body.text
  });
};
```

### DemandLane

A `DemandLane` lazily generates events only when an uplink is able to receive
the event.  Demand lanes can be `cue()`-ed at extremely high rates, and only
as many events will be generated as each uplink can handle–the rate of event
generation is tailored per uplink.  Swim pays careful attention to TCP flow
control signals in order to not waste effort generating events, only to have
them sit in a network buffer taking up memory and getting stale.

Demand lanes are ideal for publishing statistical events, where it isn't
important that a client receives every incremental update, only that the
client eventually receives the latest state, that the state clients receive is
real-time (within the latency of the network), and that updates are desired
as often as possible.

#### new DemandLane([generateEvent])

Instantiates a new `DemandLane` with an optionally provided `generateEvent`
function.  A new `generateEvent` function can be assigned to the returned
`DemandLane` at any time.

```js
var counter = 0;
var stats = new service.DemandLane(function (uplink) {
  return counter;
}).register('stats');
stats.onCommand = function (message, uplink) {
  counter += 1;
  stats.cue();
};
```

#### demandLane.generateEvent = function (uplink)

The `generateEvent` function is called when the cued `uplink` is ready to
receive an event.  The value returned by `generateEvent` will be used as the
message body of event to send to the uplink.  Note that the generated event
can may be transformed by the `lane.filterEvent` callback before it gets
dispatched to the client.

#### demandLane.cue()

Signals all linked uplinks that the lane is able to generate a new event.
When a signalled uplink is ready to receive an event, the `generateEvent`
function will be called to generate the actual event to send to the uplink.
`generateEvent` may be called at different times for different uplinks.

Calls to `cue()` do _not_ accumulate, that is, calling `cue()` multiple times
before an uplink has a chance to generate an event for a previous `cue()` will
not cause additional events to be generated.  `cue()` is lightweight, and can
safely be called very frequently.

```js
var seconds = 0;
var uptime = new service.DemandLane(function (uplink) {
  return seconds;
}).register('uptime');
setInterval(function () {
  seconds += 1;
  uptime.cue();
}, 1000);
```

### JoinLane

A `JoinLane` aggregates multiple [downlinks](#downlink) in a single lane.
Linking to a `JoinLane` is like creating a one-to-many link to the set lanes
that the `JoinLane` aggregates.  `JoinLane`s are persistent, so if a service
restarts, a `JoinLane` will automatically relink to its aggregated lanes.

`JoinLane`s make it easy to abstract over large numbers of services, and to
maintain real-time reductions of the state of aggregated services.  Think of
a `JoinLane` as a streaming, dynamically reconfigurable, relational join.

```js
var chatter = new service.JoinLane().register('team/chatter');
chatter.onCommand = function (message, uplink) {
  chatter.link(message.body.chatUri, 'chat/room');
};
chatter.onJoinEvent = function (message, downlink) {
  // Republish the chat message.
  chatter.push(message.body);
};
```

#### joinLane.delegate

The object on which [onJoin* callbacks](#joinlane-callbacks) will be invoked;
defaults to `joinLane` itself.  Assign a separate event `delegate` if you need
to transition the behavior of the lane between multiple states, or if you want
to keep aggregated downlink callbacks separate from lane callbacks.

#### joinLane.push(body)

Publishes an event with message `body` to all uplinks.

```js
var chatter = new service.JoinLane().register('team/chatter');
chatter.onJoinEvent = function (message, downlink) {
  chatter.push(message.body);
};
```

#### joinLane.command(body)

Broadcasts a command with message `body` to all aggregated downlinks.

```js
var chatter = new service.JoinLane().register('team/chatter');
var announce = new CommandLane().register('team/announce');
announce.onCommand = function (message, uplink) {
  // Broadcast the announcement to all aggregated chat lanes.
  chatter.command({
    from: uplink.user.email,
    text: message.body.text
  });
};
```

#### joinLane.size

Returns the number of links aggregated by `joinLane`.

#### joinLane.isEmpty()

Returns `true` if `joinLane` doesn't aggregate any links, otherwise returns `false`.

#### joinLane.has(nodeUri, laneUri)

Returns `true` if `joinLane` maintains a [Downlink](#downlink) to the lane at
`laneUri` of the service at `nodeUri`.

#### joinLane.get(nodeUri, laneUri)

Returns `joinLane`'s [Downlink](#downlink) to the lane at `laneUri` of the
service at `nodeUri`, if `joinLane` has such a link.  Otherwise returns `undefined`.

#### joinLane.link(nodeUri, laneUri)

Creates a new persistent [Downlink](#downlink) to the lane at `laneUri` of the
service at `nodeUri`, if `joinLane` doesn't already have such a link.  The
`joinLane` is responsible for actually creating the link.  Link creation can
be customized by implementing the `joinLane.newDownlink` callback.

```js
var chatter = new service.JoinLane().register('team/chatter');
var addChat = new service.CommandLane(function (message, uplink) {
  chatter.link(message.body.chatUri, 'chat/room');
}).register('chat/add');
```

#### joinLane.unlink(nodeUri, laneUri)

Permanently unlinks the [Downlink](#downlink) to the lane at `laneUri` of the
service at `nodeUri`, if `joinLane` has such a link.

```js
var chatter = new service.JoinLane().register('team/chatter');
var removeChat = new service.CommandLane(function (message, uplink) {
  chatter.unlink(message.body.chatUri, 'chat/room');
}).register('chat/remove');
```

#### joinLane.clear()

Permanently unlinks all downlinks aggregated by `joinLane`.

```js
var chatter = new service.JoinLane().register('team/chatter');
var resetChat = new service.CommandLane(function (message, uplink) {
  chatter.clear();
}).register('chat/reset');
```

#### joinLane.forEach(callback[, thisArg])

Invokes `callback` with each [Downlink](#downlink) aggregated by `joinLane`.
If provided, `thisArg` will be passed to each invocation of `callback` as the
`this` value.

`callback` is invoked with two arguments:
- the current `Downlink`
- the `joinLane` being traversed

```js
var chatter = new service.JoinLane().register('team/chatter');
setInterval(function () {
  // Congratulate a random subset of channels every minute.
  chatter.forEach(function (downlink) {
    if (Math.random() < 0.1) {
      downlink.command('Congratulations, ' + downlink.nodeUri + '.');
    }
  });
}, 60 * 1000);
```

### JoinLane Callbacks

Aggregated downlink callbacks are invoked on the `delegate` member of a
`JoinLane`.  By default, a `JoinLane` is its own delegate, so callbacks can be
assigned directly to the lane instance.  If `delegate` is reassigned, then
callbacks will instead by invoked on the assigned `delegate` object instead.

#### joinLane.newDownlink = function (downlinkBuilder)

When a `joinLane` needs to create a new [Downlink](#downlink), it invokes the
`newDownlink` method with a [DownlinkBuilder](#downlinkbuilder) argument.
`newDownlink` returns an instantiated `Downlink`.  By default, `newDownlink`
simply returns `downlinkBuilder.sync()`.

The `downlinkBuilder` passed to `newDownlink` is pre-configured by the
`joinLane` with the `nodeUri` and `laneUri` of the link to create, and the
`keepAlive` flag set to `true`.  Note that the `joinLane` also sets the
`downlinkBuilder`'s `delegate`; if you choose to assign your own downlink
`delegate`, then the `joinLane`'s `onJoin*` callbacks will not be invoked for
that downlink.

`joinLane` calls `newDownlink` when `joinLane.link` requests a new link, and
when a service starts up and needs to re-establish its links.

```js
var chatter = new service.JoinLane().register('team/chatter');
chatter.newDownlink = function (downlinkBuilder) {
  // Link chat lanes with a lower-than-average message priority.
  downlinkBuilder.prio(-0.5).sync();
};
```

#### joinLane.onJoinEvent = function (message, downlink)

The `onJoinEvent` callback gets invoked when an aggregated `downlink` receives
an event `message` from its remote lane.

#### joinLane.onJoinCommand = function (message, downlink)

The `onJoinCommand` callback gets invoked when an aggregated `downlink` sends
a command `message` to its remote lane.

#### joinLane.onJoinLink = function (request, downlink)

The `onJoinLink` callback gets invoked when an aggregated `downlink` sends a
`request` to subscribe to its remote lane.

#### joinLane.onJoinLinked = function (response, downlink)

The `onJoinLinked` callback gets invoked when an aggregated `downlink`
receives a `response` from its remote lane indicating that a new link has
been established.

#### joinLane.onJoinSync = function (request, downlink)

The `onJoinSync` callback gets invoked when an aggregared `downlink` sends a
`request` to establish a new synchronized link to its remote lane.

#### joinLane.onJoinSynced = function (response, downlink)

The `onJoinSynced` callback gets invoked when an aggregated `downlink`
receives a `response` from its remote lane indicating that all state events
have been sent, and the link is considered synchronized.

#### joinLane.onJoinUnlink = function (request, downlink)

The `onJoinUnlink` callback gets invoked when an aggregated `downlink` sends a
`request` to unsubscribe from its remote lane.  Note that unlink requests are
not always sent when closing a link.  Implement the `onJoinClose` callback if
you need to reliably determine when a downlink unlinks.

#### joinLane.onJoinUnlinked = function (response, downlink)

The `onJoinUnlinked` callback gets invoked when an aggregated `downlink`
receives a `response` from its remote lane indicating that the link has been
closed, or that a link request has been rejected.

#### joinLane.onJoinConnect = function (downlink)

The `onJoinConnect` callback gets invoked when the network connection
underlying an aggregated `downlink` becomes available.  Note that
`onJoinConnect` will never be called for links to services that resides in the
same process, since such links aren't transported over the network.

#### joinLane.onJoinDisconnect = function (downlink)

The `onJoinDisconnect` callback gets invoked when the network connection
underlying an aggregated `downlink` becomes unavailable.  If the `keepAlive`
property of the `downlink` is set to `true`, then Swim will automatically
attempt to reconnect the link.  If `keepAlive` is `false`, then the `downlink`
will close, but remain registered with the `joinLane`.  Aggregated downlinks
have `keepAlive` set to `true` by default.

#### joinLane.onJoinError = function (downlink, error)

The `onJoinError` callback gets invoked when the network connection underlying
an aggregated `downlink` experiences an `error`.  Connections always
disconnect after a network error.

#### joinLane.onJoinClose = function (downlink)

The `onJoinClose` callback gets invoked when an aggregated `downlink` has been
disconnected and will not be reconnected.  This occurs when `joinLane.unlink`
removes a link, and when non-`keepAlive` links experience a network failure.

### ListLane

A `ListLane` maintains a persistent, ordered list of elements, which can be
automatically synchronized with client links.

```js
var todo = new service.ListLane().register('todo/list');
todo.push('first', 'second', 'third');
```

#### listLane.autoUpdate

If `true`, then `listLane` will automatically update its state in response to
received command messages.  `autoUpdate` enables client `ListDownlink`s to
transparently insert, update, remove, and reorder elements.  Defaults to `true`.

##### Service example

```js
var todo = new service.ListLane().register('todo/list');
todo.autoUpdate = true; // can be omitted; defaults to true
```

##### Client example

```js
var todo = swim.downlink()
  .node('swim://swim.example.com/todo/groceries')
  .lane('todo/list')
  .onEvenet(function (message) {
    // The automatically maintained todo.state array contains the
    // synchronized state of the remote ListLane.
    console.log(JSON.stringify(todo.state));
  });
  .syncList();
```

#### listLane.length

The number of elements stored in `listLane`.

#### listLane.isEmpty()

Returns `true` if `listlane` stores an empty list, otherwise returns `false`.

#### listLane.get(index)

Returns the value stored at element `index` of `listLane`.

#### listLane.set(index, value)

Stores `value` at element `index` of `listLane`.  Returns the previously stored
value.  Publishes an `@update` event to subscribed uplinks.

#### listLane.push(value1, ..., valueN)

Inserts one or more values to the end of `listLane`.  Publishes an `@update`
event to subscribed uplinks for each inserted value.

#### listLane.pop()

Removes and returns the last element of `listLane`, or returns `undefined` if
`listLane` is empty.  Publishes a `@remove` event to subscribed uplinks, if an
element was successfully removed.

#### listLane.unshift(value1, ..., valueN)

Inserts one or more values to the beginning of `listLane`.  Publishes an
`@insert` event to subscribed uplinks for each inserted value.

#### listLane.shift()

Removes and returns the first element of `listlane`, or returns `undefined` if
`listLane` is empty.  Publishes a `@remove` event to subscribed uplinks, if an
element was successfully removed.

#### listLane.move(fromIndex, toIndex)

Removes the element at `fromIndex` and reinserts it at element `toIndex`.
Returns the value of the element that was moved.  Publishes a `@move` event
to subscribed uplinks.

#### listLane.splice(startIndex, deleteCount[, value1, ..., valueN])

Removes `deleteCount` elements from `listlane`, starting at `startIndex`, and
inserts zero or more new values at `startIndex`.  Publishes `@remove` and
`@insert` events to subscribed uplinks as needed to keep them synchronized.

#### listLane.clear()

Removes all elements from the `listLane` list.  Publishes a `@remove` event to
subscribed uplinks for every removed element.

#### listLane.forEach(callback[, thisArg])

Invokes `callback` for every value in `listLane`.  If provided, `thisArg` will
be passed to each invocation of `callback` as the `this` value.

`callback` is invoked with three arguments:
- the current list value
- the index of the current list value
- the `ListLane` being traversed

### MapLane

A `MapLane` maintains a persistent set of keys with associated values, which
can be automatically synchronized with client links.

```js
var users = new service.MapLane().register('chat/users');
users.set('root', {name: 'Superuser'});
```

#### new service.MapLane([primaryKey])

Instantiates a new `MapLane` with an optionally provided `primaryKey`
function.  The `primaryKey` function extracts and retuns a key from a value.
A `primaryKey` is required for `autoUpdate` to work properly.

#### mapLane.autoUpdate

If `true`, then `mapLane` will automatically update its state in response to
received command messages.  `autoUpdate` enables client `MapDownlink`s to
transparently update and remove values.  The `autoUpdate` handler uses the
`primaryKey` function, given when the lane was created, to extract keys from
received update messages; this means that a structure stored in auto-updated
`MapLane` value must contain its key.  Defaults to `true`.

##### Service example

```js
var users = new service.MapLane(function (value) {
  return value.id;
}).register('chat/users');
users.autoUpdate = true; // can be omitted; defaults to true
```

##### Client example

```js
var users = swim.downlink()
  .node('swim://swim.example.com/chat/public')
  .lane('chat/users')
  .onEvenet(function (message) {
    // The automatically maintained users.state array contains the
    // synchronized state of the remote MapLane.
    console.log(JSON.stringify(users.state));
  });
  .syncMap();
```

#### mapLane.size

The number of keys stored in `mapLane`.

#### mapLane.isEmpty()

Returns `true` if `mapLane` doesn't have an keys with associated values,
otherwise returns `false`.

#### mapLane.has(key)

Returns `true` if `mapLane` has a value associated with `key`, otherwise
returns `false`.

#### mapLane.get(key)

Returns the value associated with `key`, or returns `undefined` if `key`
doesn't have an associated value in `mapLane`.

#### mapLane.set(key, value)

Associates a new `value` with `key`.  Returns the value previously associated
with `key` in `mapLane`, or returns `undefined` if no value was previously
associated with `key`.  Publishes an update event to subscribed uplinks.

#### mapLane.delete(key)

Removes `key` and its associated value from `mapLane`.  Returns the value
that was previously associated with `key`, or returns `undefined` if `key` had
no previous association in `mapLane`.  Publishes a `@remove` event to
subscribed uplinks, if `key` was successfully removed.

#### mapLane.clear()

Removes all keys and associated values from `mapLane`.  Publishes a `@remove`
event to subscribed uplinks for every removed value.

#### mapLane.forEach(callback, thisArg)

Invokes `callback` for every key-value pair in `mapLane`.  If provided,
`thisArg` will be passed to each invocation of `callback` as the `this` value.

`callback` is invoked with three arguments:
- the current map value
- the key with which the current value is associated
- the `MapLane` being traversed

#### mapLane.find(predicate, thisArg)

Tests each key-value pair in `mapLane` against a `predicate` function.
Returns the first value for which `predicate` returned `true`, or returns
`undefined` if `predicate` never returned `true`.  If provided, `thisArg` will
be passed to each invocation of `predicate` as the `this` value.

`predicate` is invoked with three arguments:
- the current map value
- the key with which the current value is associated
- the `MapLane` being traversed

### TailLane

A `TailLane` persists a moving window of events, the current state of which
can be synchronized with client links.  A `TailLane` delegates to a `dropWhile`
function to decide when to remove old values from the event buffer.

#### new service.TailLane([dropWhile])

Instantiates a new `TailLane` with an optionally provided `dropWhile` function.
If no `dropWhile` function is provided, then old values will never be dropped
from the event buffer.  A new `dropWhile` function can be assigned to the
returned `TailLane` at any time.

```js
var chat = new service.TailLane(function (message) {
  // Drop old message after one hour.
  return Date.now() - message.time > 60 * 60 * 1000;
}).register('chat/room');
```

#### tailLane.dropWhile

The function that will be used to determine whether or not to drop an old
value from the start of the event buffer.  `dropWhile` is invoked with the
first value in the event buffer, and returns `true` if the value should be
dropped, or returns `false` if the value should be kept.  `dropWhile` is
repeatedly called until either it returns `false`, or there or no more values
in the event buffer.

#### tailLane.push(value1, ..., valueN)

Appends one or more values to the end of the event buffer.  Publishes an
event to subscribed uplinks for each inserted value.

### ValueLane

A `ValueLane` persists a single value, which can be automatically synchronized
with client links.  Think of a `ValueLane` like an observable property of a
service.

```js
var info = new service.ValueLane().register('chat/info');
if (!info.get()) {
  info.set({name: 'Untitled'});
}
```

#### valueLane.autoUpdate

If `true`, then `valueLane` will automatically update its value to the body of
received command messages.  Defaults to `true`.

#### valueLane.get()

Returns the value stored in `valueLane`.

#### valueLane.set(value)

Stores `value` in `valueLane`.  Returns the previous value stored in `valueLane`.

### User

A `User` object represents the identity of a software agent using the service.
`User`s have a private key-value map that can only be accessed by services in
the same deployment group.  The user store can be used to persist user
preferences and access control permissions, among other things.

#### user.isIdentified

Returns `true` if the `user` has a know identity; returns `false` for
anonymous users.

#### user.isAuthenticated

Returns `true` if the authenticity of the `user`'s crededentials have been
verified, otherwise returns `false`.

#### user.fromUri

Returns the host URI that uniquely identifies the `user`'s origin.  `fromUri`
is a valid Swim host URI, and can be used to address services in the user`s
client environment.  `fromUri` may only be valid for the duration of the
user's current network connecton.  Services must _never_ open `keepAlive`
links to a user's `fromUri`.

#### user.email

Returns the email address of the `user`, if it's known.

#### user.name

Returns the real name of the `user`, it it's known.

#### user.has(key)

Returns `true` if the `user` has a value associated with `key`, otherwise
returns `false`.

#### user.get(key)

Returns the value associated with `key` for the `user`, or returns `undefined`
if the `user` has no value associated with `key`.

#### user.set(key, value)

Associates a new `value` with `key` for the `user`.  Returns the value
previously associated with `key`, or returns `undefined` if `key` had no
previous association for the `user`.

#### user.delete(key)

Removes `key` and its associated value from the `user`.  Returns the value
that was previously associated with `key`, or returns `undefined` if `key` had
no previous association for the `user`.

### Uplink

An `Uplink` represents an inbound link connected to a lane of the current service.

#### uplink.nodeUri

Returns the URI of the service to which the `uplink` is connected–equivalent to
`service.nodeUri`.

#### uplink.laneUri

Returns the URI of the lane to which the `uplink` is connected.  The `laneUri`
of an `uplink` might not be equivalent to the `laneUri` of the lane to which
the `uplink` is connected.  For example, an `uplink.laneUri` may contain
query parameters that specialize the scope or behavior of an `uplink`.

#### uplink.prio

Returns the relative priority of the `uplink`.  The priority is a floating
point value between `-1.0` and `1.0`, with `-1.0` being the lowest priority,
`0.0` being normal priority, and `1.0` being the highest priority.  The
`uplink` priority may be any value in the priority interval.

#### uplink.user

Returns the [User](#user) that created the `uplink`.

#### uplink.close()

Unlinks the `uplink` from the lane to which it's connected.

### Uplink Callbacks

#### uplink.filterEvent = function (message)

The `filterEvent` callback gets invoked just before an event is dispatched to
`uplink`.  `body` contains the message itself.  The value returned by
`filterEvent` will be used as the actual message body sent to `uplink`.
Use `filterEvent` to mask sensitive fields based on the `uplink.user`, or to
insert new fields that only `uplink` should receive.

#### uplink.onEvent = function (message)

The `onEvent` callback gets invoked just before an event `message` is
dispatched to `uplink`.  `onEvent` observes the exact message that
will be sent, including any transformations made by `filterEvent`.

#### uplink.onLink = function (request)

The `onLink` callback gets invoked when `uplink` requests a new subscription.
If `uplink` requests a synchronized subscription, then `onLink` will _not_ be
called; `onSync` will be called instead.

#### uplink.onLinked = function (response)

The `onLinked` callback gets invoked when the lane responds to `uplink` that a
new link has been established.

#### uplink.onSync = function (request)

The `onSync` callback gets invoked when `uplink` requests a new synchronized
subscription, meaning the uplink wants to subscribe to the lane and receive an
initial batch of events containing the current state of the lane.

#### uplink.onSynced = function (response)

The `onSynced` callback gets invoked when the lane responds to `uplink` that
all state events have been sent, and `uplink` is now fully synchronized.
`uplink` will continue to receive additional events as they occur.

#### uplink.onUnlink = function (request)

The `onUnlink` callback gets invoked when `uplink` requests to unsubscribe
from the lane.

#### uplink.onUnlinked = function (response)

The `onUnlinked` callback gets invoked when the lane responds to `uplink` that
its subscription has been cancelled.

### Downlink

A `Downlink` represents an outbound link connected to a lane of some other service.

#### downlink.hostUri

Returns the URI of the host to which `downlink` connects.

#### downlink.nodeUri

Returns the URI of the service to which `downlink` connects.

#### downlink.laneUri

Returns the URI of the lane to which `downlink` connects.

#### downlink.prio

Returns the floating point priority level of the `downlink`.

#### downlink.isConnected

Returns `true` if `downlink` is currently connected.

#### downlink.keepAlive

If `true`, then Swim will attempt to reconnect the link when `downlink`
experiences a network failure.  If `false`, then `downlink` will close after
a network failure.

#### downlink.delegate

The object on which downlink callbacks will be invoked; defaults to `downlink`
itself.  Assign a separate event `delegate` if you need to transition the
behavior of the `downlink` between multiple states.

#### downlink.command(body)

Sends a command message conatining `body` to the lane to which `downlink` is
connected.

#### downlink.close()

Unlinks the `downlink` from the lane to which it's connected.

### Downlink Callbacks

Downlink callbacks are invoked on the `delegate` member of a `Downlink`.
By default, a `Downlink` is its own delegate, so callbacks can be assigned
directly to a downlink object.  If `delegate` is reassigned, then callbacks
will instead by invoked on the assigned `delegate` object.

#### downlink.onEvent = function (message)

The `onEvent` callback gets invoked when a `downlink` receives an event
`message` from its remote lane.

#### downlink.onCommand = function (message)

The `onCommand` callback gets invoked when `downlink` sends a command `message`
to its remote lane.

#### downlink.onLink = function (request)

The `onLink` callback gets invoked when `downlink` sends a `request` to
subscribe to its remote lane.

#### downlink.onLinked = function (response)

The `onLinked` callback gets invoked when `downlink` receives a `response`
from its remote lane indicating that a new link has been established.

#### downlink.onSync = function (request)

The `onSync` callback gets invoked when `downlink` sends a `request` to
establish a new synchronized link to its remote lane.

#### downlink.onSynced = function (response)

The `onSynced` callback gets invoked when `downlink` receives a `response`
from its remote lane indicating that all state events have been sent, and the
link is considered synchronized.

#### downlink.onUnlink = function (request)

The `onUnlink` callback gets invoked when `downlink` sends a `request` to
unsubscribe from its remote lane.  Note that unlink requests are not always
sent when closing a link.  Implement the `onJoinClose` callback if you need to
reliably determine when a downlink unlinks.

#### downlink.onUnlinked = function (response)

The `onUnlinked` callback gets invoked when  `downlink` receives a `response`
from its remote lane indicating that the link has been closed, or that a link
request has been rejected.

#### downlink.onConnect = function ()

The `onConnect` callback gets invoked when the network connection underlying
`downlink` becomes available.  Note that `onConnect` will never be called for
links to services that resides in the same process, since such links aren't
transported over the network.

#### downlink.onDisconnect = function ()

The `onDisconnect` callback gets invoked when the network connection
underlying `downlink` becomes unavailable.  If the `keepAlive` property of
`downlink` is set to `true`, then Swim will automatically attempt to reconnect
the link.  If `keepAlive` is `false`, then `downlink` will close.

#### downlink.onError = function ()

The `onError` callback gets invoked when the network connection underlying
`downlink` experiences an `error`.

#### downlink.onClose = function ()

The `onClose` callback gets invoked when `downlink` has been disconnected and
will not be reconnected.

### DownlinkBuilder

A `DownlinkBuilder` is used to construct an outbound link to a lane of some service.

#### downlinkBuilder.host()

Returns the host URI of the downlink to create.

#### downlinkBuilder.host(hostUri)

Sets the host URI of the downlink to create and returns `this`.

#### downlinkBuilder.node()

Returns the node URI of the downlink to create.

#### downlinkBuilder.node(nodeUri)

Sets the node URI of the downlink to create and returns `this`.

#### downlinkBuilder.lane()

Returns the lane URI of the downlink to create.

#### downlinkBuilder.lane(laneUri)

Sets the lane URI of the downlink to create and returns `this`.

#### downlinkBuilder.prio()

Returns the priority of the downlink to create.

#### downlinkBuilder.prio(prio)

Sets the priority of the downlink to create and returns `this`.

#### downlinkBuilder.keepAlive()

Returns the keep-alive mode of the downlink to create.

#### downlinkBuilder.keepAlive(keepAlive)

Sets the keep-alive flag of the downlink to create and returns `this`.

#### downlinkBuilder.delegate()

Returns the event delegate of the downlink to create.

#### downlinkBuilder.delegate(delegate)

Sets the event delegate of the downlink to create and returns `this`.

#### downlinkBuilder.onEvent(callback)

Sets the `onEvent` callback of the downlink to create and returns `this`.

#### downlinkBuilder.onCommand(callback)

Sets the `onCommand` callback of the downlink to create and returns `this`.

#### downlinkBuilder.onLink(callback)

Sets the `onLink` callback of the downlink to create and returns `this`.

#### downlinkBuilder.onLinked(callback)

Sets the `onLinked` callback of the downlink to create and returns `this`.

#### downlinkBuilder.onSync(callback)

Sets the `onSync` callback of the downlink to create and returns `this`.

#### downlinkBuilder.onSynced(callback)

Sets the `onSynced` callback of the downlink to create and returns `this`.

#### downlinkBuilder.onUnlink(callback)

Sets the `onUnlink` callback of the downlink to create and returns `this`.

#### downlinkBuilder.onUnlinked(callback)

Sets the `onUnlinked` callback of the downlink to create and returns `this`.

#### downlinkBuilder.onConnect(callback)

Sets the `onConnect` callback of the downlink to create and returns `this`.

#### downlinkBuilder.onDisconnect(callback)

Sets the `onDisconnect` callback of the downlink to create and returns `this`.

#### downlinkBuilder.onError(callback)

Sets the `onError` callback of the downlink to create and returns `this`.

#### downlinkBuilder.onClose(callback)

Sets the `onClose` callback of the downlink to create and returns `this`.

#### downlinkBuilder.link()

Returns a [Downlink](#downlink) parameterized by the `builder`'s configuration.

#### downlinkBuilder.sync()

Returns a synchronized [Downlink](#downlink) parameterized by the `builder`'s
configuration.

## JavaScript Runtime

The Swim JavaScript runtime is executed by a program called `swimjs`.
`swimjs` searches for a file called `swim.recon`, and then starts a service
container that runs the services declared in the `swim.recon` config.

`swimjs` searches for `swim.recon` in the following places:
- if `swimjs` was invoked with a command line argument, the argument is used
  as the path to the `swim.recon` file.
- If there is a Java system property named `"swim.recon"`, it's value is used
  as the path to the `swim.recon` file.
- If the current directory contains a file named `swim.recon`, that file is used.

### swim.recon file

The `swim.recon` file is a [Recon](https://github.com/swimit/recon-js)
document that contains service declarations, and other runtime and deployment
configuration details.

`swim.recon` contains one or more `@service` declarations, and a `@server`
declaration.

#### Service declaration

A service declaration begins with a `@service` attribute, and contains the
following fields:

- `name`: unique identifier for the service, used to refer to the service from
  `@route` definitions.
- `main`: path to the JavaScript source file that defines the service.

##### Example

```recon
@service {
  name: "chat"
  main: "chat.js"
}
```

#### Server declaration

A server declaration contains network configuration parameters, and `@route`
definitions used to map URIs to service class; it has the following fields:

- port: TCP port on which to listen for incoming Swim connections.
- store: path to the file used to persist service state.

`@route` definitions may appaear anywhere within a `@server` declaration.
Routes are tested for URI matches in the order that they're defined.

##### Example

```recon
@server {
  port: 80
  store: /tmp/swim.store
  @route {
    prefix: "/chat/"
    service: "chat"
  }
}
```

#### Route definition

A route definition matches a subset of URI paths, and maps those paths to a
service class.  The primary route type is a _prefix route_, which maps URIs
matching a path prefix to a service class.  Prefix routes can have variable
path elements, denoted by a path segment that begins with a colon (`':'`)
character.  Prefix routes have the following fields:

- prefix: URI path prefix to match/
- service: identifier of the service to which matching URIs should route.

##### Example

```recon
@route {
  prefix: "/group/:group/chat/:room"
  service: "chat"
}
```
