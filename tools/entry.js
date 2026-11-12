// Bundle entry: Blockly core + standard blocks + English messages -> window.Blockly
import * as Blockly from '../../blockly-main/packages/blockly/_build/core/blockly.js';
import '../../blockly-main/packages/blockly/_build/blocks/blocks.js';
import en from './en.json';
Blockly.setLocale(en);
window.Blockly = Blockly;
