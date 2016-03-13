var service = require('swim-service-js');
var recon = require('recon-js');

var chatInfo = new service.ValueLane().register('chat/info');

var chatUsers = new service.MapLane().register('chat/users');
chatUsers.clear(); // clear on startup

var chatRoom = new service.TailLane(function (message) {
  // Delete chat messages after 15 minutes.
  return Date.now() - (message.time || 0) > 15 * 60 * 1000;
}).register('chat/room');

chatRoom.onCommand = function (message, uplink) {
  if (!uplink.user.email) return;
  console.log(uplink.user.email + ' posted ' + message.body.text);
  chatRoom.push({
    from: uplink.user.email, // insert user credentials
    name: uplink.user.name,
    time: Date.now(),
    text: message.body.text
  });
};

// Called when a user first links to the lane
chatRoom.onEnter = function (user) {
  if (!user.email) return;
  // Add user to chat/users lane
  console.log(user.email + ' entered ' + service.nodeUri);
  chatUsers.set(user.email, {email: user.email, name: user.name});

  // Update userCount in chat/info lane
  var info = chatInfo.get() || {};
  info.userCount = chatUsers.size;
  chatInfo.set(info);
};

// Called when a user last unlinks from the lane
chatRoom.onLeave = function (user) {
  if (!user.email || !chatUsers.has(user.email)) return;
  // Remove user from chat/users lane
  console.log(user.email + ' left ' + service.nodeUri);
  chatUsers.delete(user.email);

  // Update userCount in chat/info lane
  var info = chatInfo.get() || {};
  info.userCount = chatUsers.size;
  chatInfo.set(info);
};

var chatInput = new service.CommandLane().register('chat/input');
chatInput.onCommand = function (message, info) {
  if (!info.user.email) return;
  var chatUser = chatUsers.get(info.user.email);
  if (!chatUser) return;
  var typing = message.body['@typing'] // get value of recon @typing attribute
  if (typing !== undefined && typing !== 'false') {
    // Add typing properties when user starts typing
    chatUser.typing = true;
    chatUser.typingTime = Date.now();
    console.log(info.user.email + ' started typing');
  } else {
    // Remove typing properties when user stops typing
    recon.remove(chatUser, 'typing');
    recon.remove(chatUser, 'typingTime');
    console.log(info.user.email + ' stopped typing');
  }
  // Update user to reflect new typing state
  chatUsers.set(info.user.email, chatUser);
};
