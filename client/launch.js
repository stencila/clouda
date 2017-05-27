function launch () {
  var address = window.location.pathname.substring(1);

  var eventSource = new EventSource('/~launch/' + address);

  var terminal = document.createElement('div');
  terminal.className = 'terminal';
  document.getElementsByTagName('body')[0].appendChild(terminal);

  eventSource.addEventListener('stdout', function(event) {
    var pre = document.createElement('pre');
    pre.className = 'stdout';
    pre.innerHTML = event.data;
    terminal.appendChild(pre);
  }, false);

  eventSource.addEventListener('stderr', function(event) {
    var pre = document.createElement('pre');
    pre.className = 'stderr';
    pre.innerHTML = event.data;
    terminal.appendChild(pre);
  }, false);

  eventSource.addEventListener('goto', function(event) {
    window.location = 'http://' + window.location.hostname + ':' + event.data + '/~';
  }, false);

  eventSource.addEventListener('end', function(event) {
    var div = document.createElement('div');
    div.className = 'end';
    document.getElementsByTagName('body')[0].appendChild(div);

    eventSource.close()
  }, false);

  eventSource.onerror = function(event) {
    console.error(event);
    eventSource.close();
  };
}
