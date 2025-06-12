import { NextResponse } from 'next/server';
import { getDbConnectionStatus, disconnectFromDatabase } from "../../actions"; // Import from actions

export async function GET() {
  try {
    const status = await getDbConnectionStatus(); // Call the server action
    return NextResponse.json(status);
  } catch (error: unknown) {
    console.error('API Get Connection Status Error:', error); // Log API error
    const errorMessage = error instanceof Error ? error.message : String(error); // Type narrowing
    return NextResponse.json({ connected: false, error: errorMessage }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const result = await disconnectFromDatabase(); // Call the server action
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('API Disconnect Error:', error); // Log API error
    const errorMessage = error instanceof Error ? error.message : String(error); // Type narrowing
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}