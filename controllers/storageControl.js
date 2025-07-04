// const path = require('path');
const fs = require('fs');
const {db, dbPdf } = require('../databases/db');
require("dotenv").config();
const path = require('path');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const slugify = require('slugify');
const session = require('express-session');
const bcrypt = require('bcrypt');
//Import functions
const { isStrongPassword } = require('../middleware/controlware')

//Site Storage Controller functions
//image upload and verify
exports.imgUpload = (req, res) => {
    const imageUrl = `/images/${req.file.filename}`
    const slug = req.body.slug
    console.log(slug)
    for (const obj of pages) {
        for (const key in obj) {
            if (obj[key] === slug) {
                obj.profile = imageUrl;
                page = obj
                break;
            }
        }
    }
    fs.writeFileSync('pages.json', JSON.stringify(pages, null, 2));
    if (!page) return res.status(404).send('Page not found');
    // res.render('page', {page})
    res.redirect(`/pages/${slug}`)
    // res.send(`Image uploaded! View it <a href="${imageUrl}">here</a>`);
};

//PDF upload and verify
exports.pdfUpload = (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded. Check multer.')
    }
  const { title, tags } = req.body;
  tagList = tags.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0)
//   console.log(tagList)
  const slug = slugify(title, { lower: true, strict: true });
//   console.log(req.file)
  const filename = req.file.filename; //req.file.originalname
//   console.log(title)
//   console.log(filename)
//   console.log(req.session.user.username)

  dbPdf.run(
    'INSERT INTO pdfs (title, slug, filename, uploaded_by) VALUES (?, ?, ?, ?)',
    [title, slug, filename, req.session.user.username],
    function (err) {
      if (err) {
        console.error(err);
        return res.send('Error uploading PDF.');
      }
      const pdfId = this.lastID

      tagList.forEach(tag => {
        dbPdf.run(
            `INSERT OR IGNORE INTO tags (name) VALUES (?)`, [tag],
            function (err) {
                if (err) return console.error(err.message)
// Get tag ID
                dbPdf.get(`SELECT id FROM tags WHERE name = ?`, [tag], (err, row) => {
                    if (err) return console.error('Tag select error:', err.message)
                    const tagId = row.id

// Get Link in pdf_tags 
                    dbPdf.run(
                        `INSERT OR IGNORE INTO pdf_tags (pdf_id, tag_id) VALUES (?, ?)`, 
                        [pdfId, tagId], (err) => {
                            if (err) console.error('pdf_tags insert error:', err.message)
                        }

                    )
                })
            }
        )
      })
      res.json({ success: true, title: title, slug: slug });;
    });
};


//user deletes file(s)
exports.deletePdf = (req, res) => {
  const pdfId = req.params.id;

  // Optionally check that the current user owns the file
    dbPdf.get(`SELECT * FROM pdfs WHERE id = ?`, [pdfId], (err, row) => {
        if (row.uploaded_by !== req.session.user.username) {
            return res.status(403).send('Forbidden');
        }
        // console.log(row)
            const filePath = path.join(__dirname, 'public', 'pdfs', path.basename(row.filename));
            // console.log(filePath)

            dbPdf.run(`DELETE FROM pdf_tags WHERE pdf_id = ?`, [pdfId], function (err) {
                if (err) {
                    console.error('Failed to delete related pdf_tags:', err.message)
                    return res.status(500).json({ success: false })
                }
            
                dbPdf.run(`DELETE FROM pdfs WHERE id = ?`, [pdfId], function (err) {
                    if (err) {
                    console.error('Failed to delete PDF:', err.message);
                    return res.status(500).json({ success: false });
                    }
                    // 4. Then delete the actual file
                    fs.unlink(filePath, (fsErr) => {
                    if (fsErr && fsErr.code !== 'ENOENT') {
                        console.error('Failed to delete file:', fsErr.message);
                        // optional: you could still consider it successful if DB delete worked
                        return res.status(500).json({ success: false, message: 'File delete error' });
                    }

                    // // Also delete related entries (like from pdf_tags)
                    // dbPdf.run(`DELETE FROM pdf_tags WHERE pdf_id = ?`, [pdfId]);
                    res.json({ success: true });
                })
            })
        });
    })
};

