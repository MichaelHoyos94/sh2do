import type { RequestHandler } from 'express';
import type { ListTagsQuery } from './tags.schemas.js';
import { tagsService } from './tags.service.js';

export const listTags: RequestHandler = async (req, res) => {
  // validateQuery ya dejó en req.query el resultado de Zod.
  res.json(await tagsService.list(req.user!.id, req.query as unknown as ListTagsQuery));
};

export const createTag: RequestHandler = async (req, res) => {
  const tag = await tagsService.create(req.user!.id, req.body.name);
  res.status(201).location(`/api/v1/tags/${tag.id}`).json(tag);
};

// En las rutas con :tagId, validateTagId ya garantizó que es un entero positivo.
export const renameTag: RequestHandler = async (req, res) => {
  res.json(await tagsService.rename(req.user!.id, Number(req.params.tagId), req.body.name));
};

export const deleteTag: RequestHandler = async (req, res) => {
  await tagsService.delete(req.user!.id, Number(req.params.tagId));
  res.status(204).end();
};
