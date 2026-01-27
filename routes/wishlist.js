import express from 'express';
import { WishlistCategory, WishlistProduct } from '../models/index.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/wishlist/catalog
 * Categories and products for the dating app wishlist UI (browse, add/remove).
 * Protected: user must be logged in.
 */
router.get('/catalog', protect, async (req, res) => {
  try {
    const categories = await WishlistCategory.findAll({
      where: { isActive: true },
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
      attributes: ['id', 'name', 'slug', 'sortOrder'],
    });

    const products = await WishlistProduct.findAll({
      where: { isActive: true },
      include: [
        { model: WishlistCategory, as: 'category', attributes: ['id', 'name', 'slug'] },
      ],
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
      attributes: ['id', 'categoryId', 'name', 'description', 'imageUrl', 'sortOrder'],
    });

    res.json({ categories, products });
  } catch (error) {
    console.error('Wishlist catalog error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
