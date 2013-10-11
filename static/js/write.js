/* global $,_ */

$(function() {

  var minLength = 10;
  var maxLength = 200;

  var $chapterForm = $('#chapter-form');
  var $chapter = $('#chapter');
  var $charLimit = $('#char-limit');

  var validate = _.throttle(function(e) {

    var length;
    var result;
    var valid;
    var matches = $chapter.val().match(/\w+/g);
    if (matches === null) {
      length = 0;
    }
    else {
      length = matches.length;
    }
    

    if (length === minLength - 1) {
      valid = false;
      result = 'You need ' + (minLength - length) + ' more word to meet the minimum.';
    }
    else if (length < minLength) {
      valid = false;
      result = 'You need ' + (minLength - length) + ' more words to meet the minimum.';
    }
    else if (length < maxLength) {
      valid = true;
      result = '' + length + ' / ' + maxLength;
    }
    else if (length === maxLength) {
      valid = true;
      result = 'You\'ve reached the word limit';
    }
    else if (length === maxLength + 1) {
      valid = false;
      result = 'You\'re ' + (length - maxLength) + ' word over the maximum';
    }
    else {
      valid = false;
      result = 'You\'re ' + (length - maxLength) + ' words over the maximum';
    }

    if (valid) {
      $charLimit.removeClass('invalid');
    }
    else {
      $charLimit.addClass('invalid');
    }

    $charLimit.text(result);

    return valid;

  }, 10);

  validate();

  $chapter.on('keyup', validate);

  $chapterForm.on('submit', function(e) {
    var valid = validate();
    if (!valid) {
      e.preventDefault();
      $charLimit.addClass('emphasis');
      setTimeout(function() {
        $charLimit.removeClass('emphasis');
        setTimeout(function() {
          $charLimit.addClass('emphasis');
          setTimeout(function() {
            $charLimit.removeClass('emphasis');
          }, 100);
        }, 100);
      }, 100);
    }
  });

});