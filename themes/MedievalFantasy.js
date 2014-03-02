/* jshint node:true */

var _ = require('lodash');

var $ = require('./helpers.js');

var creatureAdjectives = [
  'hideous',
  'beautiful',
  'peaceful',
  'violent'
];

var creatureNouns = [
  'goat',
  'elf',
  'ogre',
  'dwarf',
  'dragon',
  'mare',
  'stallion',
  'halfling'
];

function creature() {
  var adjective = _.sample(creatureAdjectives);
  var noun = _.sample(creatureNouns);
  return $.a(adjective) + ' ' + noun + ' is nearby.';
}

var itemAdjectives = [
  'cursed',
  'glowing',
  'broken',
  'enchanted',
  'black',
  'white'
];

var itemNouns = [
  'sword',
  'shield',
  'book',
  'candle',
  'staff',
  'cloak'
];

function item() {
  var adjective = _.sample(itemAdjectives);
  var noun = _.sample(itemNouns);
  return $.a(adjective) + ' ' + noun + ' is here.';
}

module.exports = {

  generate: function() {
    var rand = Math.random();
    var result;
    if (rand < .5) {
      result = creature();
    }
    else {
      result = item();
    }
    result = $.cap(result);
    return result;
  }

};
