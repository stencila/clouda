import express from 'express'
import router from './router'
import bodyParser = require('body-parser')
import { SESSIONS_BASE } from './route-paths'

const app = express()

app.use(SESSIONS_BASE, bodyParser.raw({ type: '*/*' }))
app.use('/', router)
app.listen(2000, () => console.log('Listening on port 2000'))
