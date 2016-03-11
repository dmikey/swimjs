var service = require('swim-service-js');
var todo = new service.ListLane().register('todo/list');
if (todo.isEmpty()) {
  todo.push({item: 'Chips'});
  todo.push({item: 'Salsa'});
}
