# Basketball GM Draft Classes & Leagues (1950-2026)

This repository contains a comprehensive collection of draft classes and base league files for use with [Basketball GM](https://play.basketball-gm.com/). It covers the era from the 1950s through the mid-2020s.

## Content
- **`base_leagues/`**: JSON files for starting a new league in a specific historical year (1950-2026).
- **`draftclasses/`**: JSON files for importing historical draft classes (1950-2025).

> **Note:** This project is still under development. Some player physical attributes (height, weight) or ratings may not perfectly reflect their real-life values yet.

---

## How to Download

If you are visiting this repository on GitHub and want to use these files, follow these steps:

### Option 1: Download everything as a ZIP (Easiest)
1. Click the green **"Code"** button at the top right of the file list.
2. Select **"Download ZIP"**.
3. Once downloaded, extract the `.zip` file on your computer.
4. You will now have all the folders and JSON files ready to use.

### Option 2: Clone the repository (For Git users)
If you have Git installed, you can clone the repository to stay updated with future changes:
```bash
git clone https://github.com/[YOUR_USERNAME]/BBallGMDraftClasses.git
```

### Option 3: Download individual files
If you only need one specific year:
1. Navigate into the `base_leagues` or `draftclasses` folder.
2. Click on the file you want (e.g., `league1984.json`).
3. Click the **"Download raw file"** icon (down arrow) or right-click the **"Raw"** button and select **"Save link as..."**.

---

## Included Reports
This repository also includes two summary reports generated from the same historical league and draft data:

- **`yearly_report.txt`**
  - Yearly rankings report covering seasons 1950–2026.
  - Lists top teams by season using average overall rating of the top 8 rostered players.
  - Includes season-by-season rankings, top teams, and player highlights.

- **`career_report.txt`**
  - Career and all-time rankings report covering the same historical span.
  - Includes top single-season overall performances and all-time ranking summaries.
  - Shows historical leaderboards for individual players and seasons.

Both reports reference:
- Base leagues: 77
- Seasons: 1950–2026
- Unique players: 4786
- Total player-seasons: 24963

---

## How to Use in Basketball GM

### Using a Base League
1. Open [Basketball GM](https://play.basketball-gm.com/).
2. Go to **"New League"**.
3. Under **"Select Roster"**, choose **"Upload League File"**.
4. Select the `.json` file from the `base_leagues` folder for the year you want to start.

### Using a Draft Class
1. Within an active league, go to **"Draft"** -> **"Draft Scouting"**.
2. Click **"Import Draft Class"**.
3. Select the `.json` file from the `draftclasses` folder for the upcoming draft year.

---

## Contributing
If you notice any errors in player data or want to help improve the classes, feel free to open an issue or submit a pull request!
