import { NextRequest, NextResponse } from 'next/server';
import { message } from "../../actions" ; // Import from actions
import { StoredMessage } from '@langchain/core/messages';

export async function POST(request: NextRequest) {
  try {
    const { messages }: { messages: StoredMessage[] } = await request.json();
    const result = await message(messages); // Call the server action
    return NextResponse.json({ result });
  } catch (error: unknown) { // Change 'any' to 'unknown'
    console.error('API Message Error:', error); // Log API error
    const errorMessage = error instanceof Error ? error.message : String(error); // Type narrowing
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}