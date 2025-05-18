"use server"

import { ChatWatsonx } from "@langchain/community/chat_models/ibm";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { mapStoredMessagesToChatMessages, StoredMessage } from "@langchain/core/messages";
import { execute } from "./database"
import { customerTable, orderTable } from "./consants";
export const message = async (messages: StoredMessage[]) => {
    const deserialized = mapStoredMessagesToChatMessages(messages);

    const getFromDB = tool(
        async (input) => {
            if (input?.sql) {
                const result = await execute(input.sql);
                console.log({ result, sql: input.sql })
            }
            return null;
        },
        {
            name: "get_from_db",
            description: `Get data from a database, the database has a following schema:
            ${orderTable}
            ${customerTable}
            `,
            schema: z.object({
                sql: z
                    .string()
                    .describe("SQL query to get datafrom a aSQL database. Put quotes around the field and table names."),
            }),
        }
    )

    const agent = createReactAgent({
        llm: new ChatWatsonx({
            model: "ibm/granite-3-8b-instruct",
            projectId: process.env.WATSONX_AI_PROJECT_ID,
            serviceUrl: process.env.WATSONX_AI_ENDPOINT,
            version: "2024-05-31",
        }),
        tools: [getFromDB],
    });

    const response = await agent.invoke({
        messages: deserialized
    });

    return response.messages[response.messages.length - 1].content;
}