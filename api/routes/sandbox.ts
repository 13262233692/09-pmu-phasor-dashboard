import { Router, type Request, type Response } from 'express';
import { sandboxEngine } from '../services/sandboxEngine.js';

const router = Router();

router.get('/events', (req: Request, res: Response) => {
  const events = sandboxEngine.listEvents();
  res.json({
    code: 0,
    message: 'success',
    data: events,
  });
});

router.get('/events/:id', (req: Request, res: Response) => {
  const event = sandboxEngine.getEvent(req.params.id);
  if (!event) {
    res.status(404).json({ code: 1, message: 'Event not found' });
    return;
  }
  res.json({ code: 0, message: 'success', data: event });
});

router.post('/events/:id/ack', (req: Request, res: Response) => {
  const ok = sandboxEngine.ackEvent(req.params.id);
  res.json({ code: ok ? 0 : 1, message: ok ? 'success' : 'event not found' });
});

router.get('/events/:id/timeline', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!sandboxEngine.hasEvent(id)) {
    res.status(404).json({ code: 1, message: 'Event not found' });
    return;
  }
  const startTs = req.query.start ? Number(req.query.start) : undefined;
  const endTs = req.query.end ? Number(req.query.end) : undefined;
  const interval = Number(req.query.interval || 20);
  const data = sandboxEngine.getEventTimeline(id, startTs, endTs, interval);
  res.json({
    code: 0,
    message: 'success',
    data: {
      snapshots: data,
      total: data.length,
    },
  });
});

router.get('/events/:id/bookmarks', (req: Request, res: Response) => {
  const { id } = req.params;
  const bookmarks = sandboxEngine.getBookmarks(id);
  res.json({ code: 0, message: 'success', data: bookmarks });
});

router.post('/events/:id/bookmarks', (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body || {};
  const bm = sandboxEngine.addBookmark({
    eventId: id,
    timestamp: Number(body.timestamp || Date.now()),
    title: body.title || '自定义书签',
    color: body.color || '#ffdd00',
    note: body.note,
    type: body.type || 'custom',
  });
  if (!bm) {
    res.status(404).json({ code: 1, message: 'Event not found' });
    return;
  }
  res.json({ code: 0, message: 'success', data: bm });
});

router.delete('/events/:id/bookmarks/:bid', (req: Request, res: Response) => {
  const { id, bid } = req.params;
  const ok = sandboxEngine.deleteBookmark(id, bid);
  res.json({ code: ok ? 0 : 1, message: ok ? 'success' : 'not found' });
});

router.get('/events/:id/deltas', (req: Request, res: Response) => {
  const { id } = req.params;
  const refTs = req.query.ref ? Number(req.query.ref) : undefined;
  const deltas = sandboxEngine.getIslandingDeltas(id, refTs);
  res.json({ code: 0, message: 'success', data: deltas });
});

export default router;
