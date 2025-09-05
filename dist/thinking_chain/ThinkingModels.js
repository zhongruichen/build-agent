"use strict";
/**
 * This module implements the six core thinking models described in the Ultimate Thinking Chain.
 * Each model can be invoked to process a specific piece of text or context.
 */
class ThinkingModels {
    /**
     * Applies the First Principle Thinking model.
     * @param {string} text The text to analyze.
     * @returns {string} The result of the analysis.
     */
    static firstPrinciple(text) {
        // TODO: Implement the logic to break down the text into its fundamental truths.
        console.log(`Applying First Principle model to: ${text}`);
        return `[First Principle Analysis]: ${text}`;
    }
    /**
     * Applies the Socratic Questioning model.
     * @param {string} text The text to question.
     * @returns {string} The result of the questioning.
     */
    static socraticQuestioning(text) {
        // TODO: Implement a series of deep, probing questions about the text.
        console.log(`Applying Socratic Questioning model to: ${text}`);
        return `[Socratic Questioning]: Why is "${text}" the case? What are the underlying assumptions?`;
    }
    /**
     * Applies the Six Thinking Hats model.
     * @param {string} text The topic to view from multiple perspectives.
     * @returns {object} An object containing analysis from each hat's perspective.
     */
    static sixThinkingHats(text) {
        // TODO: Implement analysis from White, Red, Black, Yellow, Green, and Blue hat perspectives.
        console.log(`Applying Six Thinking Hats model to: ${text}`);
        return {
            white: `[Facts about ${text}]`,
            red: `[Feelings about ${text}]`,
            black: `[Cautions about ${text}]`,
            yellow: `[Benefits of ${text}]`,
            green: `[Creative ideas for ${text}]`,
            blue: `[Summary and next steps for ${text}]`,
        };
    }
    /**
     * Applies the Inverse Thinking model.
     * @param {string} goal The goal to think about in reverse.
     * @returns {string} A list of things to avoid to achieve the goal.
     */
    static inverseThinking(goal) {
        // TODO: Implement the logic to identify failure modes and what to avoid.
        console.log(`Applying Inverse Thinking model to: ${goal}`);
        return `[Inverse Thinking]: To fail at "${goal}", we should...`;
    }
    /**
     * Applies the Systems Thinking model.
     * @param {string} system The system to analyze.
     * @returns {string} An analysis of the system's components, relationships, and feedback loops.
     */
    static systemsThinking(system) {
        // TODO: Implement the logic to map out the system and identify leverage points.
        console.log(`Applying Systems Thinking model to: ${system}`);
        return `[Systems Thinking Analysis of ${system}]: Identifying components, relationships, and feedback loops...`;
    }
    /**
     * Applies the Lateral Thinking model.
     * @param {string} problem The problem to solve creatively.
     * @returns {string} A list of unconventional ideas and solutions.
     */
    static lateralThinking(problem) {
        // TODO: Implement techniques like random input, concept extraction, etc.
        console.log(`Applying Lateral Thinking model to: ${problem}`);
        return `[Lateral Thinking on ${problem}]: What if we approached this from a completely different angle?`;
    }
}
module.exports = { ThinkingModels };
//# sourceMappingURL=ThinkingModels.js.map