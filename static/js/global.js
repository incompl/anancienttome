/* global $,_ */

$(function() {

  $('.confirm').on('click', function(e) {
    var confirmed = window.confirm('Woah there! Are you sure about that?');
    if (!confirmed) {
      e.preventDefault();
    }
  });

});