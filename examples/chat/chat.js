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
