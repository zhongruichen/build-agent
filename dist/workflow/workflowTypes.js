"use strict";
/**
 * @typedef {Object} Node
 * @property {string} id
 * @property {string} type
 * @property {{x: number, y: number}} position
 * @property {Object<string, any>} properties
 * @property {string[]} inputs
 * @property {string[]} outputs
 */
/**
 * @typedef {Object} Connection
 * @property {string} id
 * @property {string} source
 * @property {number} sourceOutput
 * @property {string} target
 * @property {number} targetInput
 */
/**
 * @typedef {Object} Workflow
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} version
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {Node[]} nodes
 * @property {Connection[]} connections
 * @property {Object<string, any>} variables
 * @property {{autoSave: boolean, validateOnChange: boolean}} settings
 */
/**
 * @typedef {Object} PropertyDefinition
 * @property {string} type - 'string', 'number', 'boolean', 'object', 'array', 'select'
 * @property {string} label
 * @property {boolean} [required]
 * @property {any} [default]
 * @property {string[]} [options]
 */
/**
 * @typedef {Object} NodeTypeDefinition
 * @property {string} label
 * @property {string} icon
 * @property {string} color
 * @property {number} inputs - 0 for none, -1 for multiple
 * @property {number} outputs - 0 for none, -1 for multiple, 2 for conditional branches etc.
 * @property {Object<string, PropertyDefinition>} properties
 */
// This file is for type definitions only, so it doesn't export anything.
module.exports = {};
//# sourceMappingURL=workflowTypes.js.map