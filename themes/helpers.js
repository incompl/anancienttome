/* jshint node:true */

module.exports = {

  a: function(str) {
    if (str.match(/^[aeiou]/i)) {
      return 'an ' + str;
    }
    else {
      return 'a ' + str;
    }
  },

  cap: function(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

};