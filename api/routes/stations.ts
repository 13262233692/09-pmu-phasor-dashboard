import { Router, type Request, type Response } from 'express'
import { redisClient } from '../services/redisClient.js'
import { DEFAULT_STATIONS } from '../config/default.js'
import type { StationConfig } from '../../shared/types.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    let stations = await redisClient.getStationConfigs()
    if (stations.length === 0) {
      stations = DEFAULT_STATIONS
    }
    
    const onlineStations = await redisClient.getOnlineStations()
    
    const stationsWithStatus = stations.map((s) => ({
      ...s,
      status: onlineStations.includes(s.name) ? 'online' : 'offline',
    }))

    res.json({
      code: 0,
      message: 'success',
      data: stationsWithStatus,
    })
  } catch (err) {
    res.status(500).json({
      code: -1,
      message: (err as Error).message,
    })
  }
})

router.get('/:id/latest', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const data = await redisClient.getLatestData(id)
    res.json({
      code: 0,
      message: 'success',
      data,
    })
  } catch (err) {
    res.status(500).json({
      code: -1,
      message: (err as Error).message,
    })
  }
})

router.get('/:id/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string || '100', 10)
    const allData = await redisClient.readLatest(Math.min(limit, 1000))
    
    res.json({
      code: 0,
      message: 'success',
      data: allData,
    })
  } catch (err) {
    res.status(500).json({
      code: -1,
      message: (err as Error).message,
    })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const station: Omit<StationConfig, 'id' | 'status'> = req.body
    const newStation: StationConfig = {
      ...station,
      id: `station-${Date.now()}`,
      status: 'offline',
      color: DEFAULT_STATIONS[0].color,
    }
    
    await redisClient.saveStationConfig(newStation)
    
    res.json({
      code: 0,
      message: 'success',
      data: newStation,
    })
  } catch (err) {
    res.status(500).json({
      code: -1,
      message: (err as Error).message,
    })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const updates: Partial<StationConfig> = req.body
    
    const existing = (await redisClient.getStationConfigs()).find((s) => s.id === id)
    if (!existing) {
      res.status(404).json({
        code: -1,
        message: 'Station not found',
      })
      return
    }
    
    const updated: StationConfig = { ...existing, ...updates }
    await redisClient.saveStationConfig(updated)
    
    res.json({
      code: 0,
      message: 'success',
      data: updated,
    })
  } catch (err) {
    res.status(500).json({
      code: -1,
      message: (err as Error).message,
    })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    await redisClient.deleteStationConfig(id)
    
    res.json({
      code: 0,
      message: 'success',
    })
  } catch (err) {
    res.status(500).json({
      code: -1,
      message: (err as Error).message,
    })
  }
})

export default router
