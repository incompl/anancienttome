/* jshint node:true */

var _ = require('lodash');

var $ = require('./helpers.js');

var creatureAdjectives = [
  'foetid',
  'accursed',
  'eldritch',
  'abnormal',
  'amorphous',
  'cyclopean',
  'abnormal',
  'furtive',
  'nameless',
  'spectral',
  'stygian',
  'winged',
  'tentacled'
];

var creatureNouns = [
  'creature',
  'humanoid'
];

function creature() {
  var adjective = _.sample(creatureAdjectives);
  var noun = _.sample(creatureNouns);
  return $.a(adjective) + ' ' + noun + ' is nearby.';
}

var itemAdjectives = [
  'dusty',
  'old',
  'ancient',
];

var itemNouns = [
  'tome',
  'journal',
  'shotgun',
  'parchment map',
  'wooden chest',
  'tablet of runes',
  'red candle',
  'antique pistol',
  'stone gargoyle',
  'ceramic bowl',
  'typewriter'
];

function item() {
  var adjective = _.sample(itemAdjectives);
  var noun = _.sample(itemNouns);
  return $.a(adjective) + ' ' + noun + ' is here.';
}

var vibeAdjectives = [
  'chilling',
  'unmentionable',
  'unnamable',
  'foetid',
  'unsettling'
];

var vibeNouns = [
  'breeze',
  'wind',
  'sound',
  'aura',
  'aroma',
  'dampness',
  'mist'
];

function vibe() {
  var adjective = _.sample(vibeAdjectives);
  var noun = _.sample(vibeNouns);
  return 'There is ' + $.a(adjective) + ' ' + noun + ' here.';
}

module.exports = {

  generate: function() {
    var rand = Math.random();
    var result;
    if (rand < .2) {
      result = creature();
    }
    else if (rand < .5) {
      result = item();
    }
    else {
      result = vibe();
    }
    result = $.cap(result);
    return result;
  }

};
