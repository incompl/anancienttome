/* global $,_ */

$(function() {

  $('.confirm').on('click', function(e) {
    var confirmed = window.confirm('Woah there! Are you sure about that?');
    if (!confirmed) {
      e.preventDefault();
    }
  });

  var $more = $('.more');
  $more.hide();
  $moreLink = $('<a href="#" class="more-link">More</div>');
  $moreLink.on('click', function(e) {
    e.preventDefault();
    $moreLink.remove();
    $more.show();
  });
  $more.after($moreLink);

});