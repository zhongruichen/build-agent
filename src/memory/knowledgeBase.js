const fs = require('fs').promises;
const path = require('path');

/** @type {string | undefined} */
let knowledgeBasePath;

/**
 * This function should be called during extension activation
 * @param {import('vscode').ExtensionContext} context
 */
function initialize(context) {
    knowledgeBasePath = path.join(context.globalStoragePath, 'knowledgeBase.json');
}

async function ensureKbFileExists() {
    if (!knowledgeBasePath) return;
    try {
        await fs.access(knowledgeBasePath);
    } catch (_) {
        // File doesn't exist, create it with an empty array
        await fs.writeFile(knowledgeBasePath, JSON.stringify([], null, 2), 'utf8');
    }
}

/**
 * @param {string} entry
 */
async function addKnowledge(entry) {
    if (!knowledgeBasePath) {
        throw new Error('Knowledge base not initialized. Call initialize(context) first.');
    }
    await ensureKbFileExists();

    const content = await fs.readFile(knowledgeBasePath, 'utf8');
    const kb = JSON.parse(content);

    // Avoid duplicate entries
    if (!kb.includes(entry)) {
        kb.push(entry);
        await fs.writeFile(knowledgeBasePath, JSON.stringify(kb, null, 2), 'utf8');
    }
}

/**
 * @param {string} query
 * @param {import('../llm/provider').OpenAICompatibleProvider} llm
 */
async function queryKnowledge(query, llm) {
     if (!knowledgeBasePath) {
        return "知识库未初始化。";
    }
    await ensureKbFileExists();

    const content = await fs.readFile(knowledgeBasePath, 'utf8');
    const kb = JSON.parse(content);

    if (kb.length === 0) {
        return "知识库为空，无可用经验。";
    }

    // Use an LLM to find the most relevant knowledge
    const prompt = `你是一个知识检索助手。请从以下知识库条目中，选出与用户查询最相关的最多5条信息。只返回相关的条目，每个条目占一行。如果找不到相关的，则返回空字符串。\n\n[知识库]\n${kb.join('\n')}\n\n[用户查询]\n${query}`;

    try {
        // Assuming the response stream provides the full text directly
        const relevantKnowledge = await llm.chatCompletion([{ role: 'user', content: prompt }]);
        return relevantKnowledge.trim() ? `--- 从知识库中检索到的相关经验 ---\n${relevantKnowledge}\n--- 结束 ---` : "在知识库中未找到直接相关的经验。";
    } catch (error) {
        console.error("Error querying knowledge base with LLM:", error);
        return "查询知识库时出错。";
    }
}

module.exports = {
    initialize,
    addKnowledge,
    queryKnowledge,
};
