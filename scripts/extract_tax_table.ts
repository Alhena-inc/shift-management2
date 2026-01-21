
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

const imageDir = '/Users/koike/Desktop/シフト/ilovepdf_pages-to-jpg';
const outputDir = '/Users/koike/Desktop/シフト/src/utils/taxTableData';

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

async function extractTextFromImages() {
    const files = fs.readdirSync(imageDir).filter(f => f.endsWith('.jpg')).sort();
    let combinedData = [];

    for (const file of files) {
        console.log(`Processing ${file}...`);
        const filePath = path.join(imageDir, file);

        // Recognizing in Japanese and English
        // Note: To optimize text extraction for tabular data, we might need pre-processing.
        // For now, we will try to extract all text to standard output to verify capability.

        try {
            const { data: { text } } = await Tesseract.recognize(
                filePath,
                'jpn',
                {
                    logger: m => console.log(m)
                }
            );

            const lines = text.split('\n').filter(line => line.trim() !== '');
            console.log(`--- Content from ${file} ---`);
            // Simple heuristic parsing to see if we can find tax rows.
            // Expected format: range_start, range_end, tax_0, tax_1, ...

            combinedData.push({ file, content: text });

        } catch (error) {
            console.error(`Error processing ${file}:`, error);
        }
    }

    // Saving raw extraction to inspect structure by AI later to build the definitive JSON.
    // We won't fully automate the parsing yet as OCR on tables is tricky.
    // We'll save the raw text to a file so the AI can read it and formulate the JSON manually/semi-manually.

    fs.writeFileSync(
        path.join(outputDir, 'raw_ocr_output.json'),
        JSON.stringify(combinedData, null, 2)
    );
    console.log('Done. Saved raw OCR output.');
}

extractTextFromImages();
