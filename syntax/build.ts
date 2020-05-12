import { writeFileSync } from 'fs'
import { syntax } from '../source/syntax'


writeFileSync(
    __dirname + '/note.tmLanguage.json',
    JSON.stringify(syntax, null, 4),
)
