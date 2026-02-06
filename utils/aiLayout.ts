import { Room } from '../types';

export const generateAiLayout = async (rooms: Room[], apiKey: string): Promise<Record<string, { x: number, y: number }>> => {
    const prompt = `
    You are an architectural space planner.
    I will provide a list of rooms with their dimensions (in pixels) and zones.
    Please arrange them into a logical floor plan layout.
    
    Input Rooms:
    ${JSON.stringify(rooms.map(r => ({
        id: r.id,
        name: r.name,
        zone: r.zone,
        width: Math.round(r.width),
        height: Math.round(r.height)
    })))}

    Instructions:
    1. Arrange the rooms on a 2D plane.
    2. Group rooms by 'zone' (e.g., Public rooms together, Private rooms together).
    3. Avoid overlapping rooms.
    4. Place the most public/central zones near (0,0).
    5. Return ONLY a JSON object where keys are room IDs and values are objects with 'x' and 'y' coordinates.
    Example: { "room-1": { "x": 0, "y": 0 }, "room-2": { "x": 100, "y": 0 } }
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            throw new Error(`AI Request Failed: ${response.statusText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) throw new Error("No response from AI");

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Invalid JSON response from AI");
        
        return JSON.parse(jsonMatch[0]);

    } catch (error) {
        console.error("AI Layout Error:", error);
        throw error;
    }
};