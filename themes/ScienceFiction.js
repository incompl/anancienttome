/* jshint node:true */

var _ = require('lodash');

var $ = require('./helpers.js');

var creatureAdjectives = [
  'beat-up',
  'slick',
  'peaceful',
  'violent'
];

var creatureNouns = [
  'android',
  'mecha-suit',
  'alien brute',
  'alien ambassador',
  'alien merchant',
  'alien blob',
  'space marine',
  'astronaut'
];

function creature() {
  var adjective = _.sample(creatureAdjectives);
  var noun = _.sample(creatureNouns);
  return $.a(adjective) + ' ' + noun + ' is nearby.';
}

var itemAdjectives = [
  'deactivated',
  'beeping',
  'broken',
  'featureless',
  'scuffed',
  'metallic'
];

var itemNouns = [
  'hand laser',
  'multitool',
  'data pad',
  'storage pod',
  'tiny robot',
  'hazard suit'
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