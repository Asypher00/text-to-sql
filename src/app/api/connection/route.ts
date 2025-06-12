import { NextRequest, NextResponse } from 'next/server';
import { getDbConnectionStatus, disconnectFromDatabase } from "../../actions"; // Import from actions

export async function GET() {
  try {
    const status = await getDbConnectionStatus(); // Call the server action
    return NextResponse.json(status);
  } catch (error: any) {
    console.error('API Get Connection Status Error:', error); // Log API error
    return NextResponse.json({ connected: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const result = await disconnectFromDatabase(); // Call the server action
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('API Disconnect Error:', error); // Log API error
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}