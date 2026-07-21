# Goodreads Ratings ML

Machine learning and exploratory analysis project on the Goodreads books dataset, focused on understanding rating patterns and preparing a clean dataset for modeling.

## Tech Stack

- Python
- Pandas, NumPy, SciPy
- Matplotlib, Seaborn, Plotly
- Scikit-learn
- Jupyter Notebook

Dependencies are listed in `requirements.txt`.

## Getting Started

### 1) Clone the repository

From the directory where you want the project folder to live (for example, your `Projects` folder):

```bash
git clone https://github.com/hyougo/Goodreads_Ratings_ML.git
cd Goodreads_Ratings_ML
```

This creates a `Goodreads_Ratings_ML` folder and checks out the repository inside it.

To use a different folder name:

```bash
git clone https://github.com/hyougo/Goodreads_Ratings_ML.git my-folder-name
cd my-folder-name
```

### 2) Create and activate a virtual environment

Windows (PowerShell):

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### 3) Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4) Set up notebook git filter

After activating the virtual environment, run once per clone:

```bash
nbstripout --install --attributes .gitattributes
```

This strips cell outputs and execution metadata from `.ipynb` files on commit, so git diffs only show source changes.

### 5) Launch Jupyter

```bash
jupyter notebook
```

## Web Application (BookWise)

A web application that serves the trained model to users: enter a book's details to get its
predicted rating, browse the book catalog with advanced search, and get personalized
recommendations. The code lives in `webapp/` — a Python FastAPI model service, a Node/TypeScript
API, and a React interface.

Run the three services (each in its own terminal), then open <http://localhost:5173>:

```bash
# 1) Model service (port 8000)
cd webapp/ml-service
python -m venv .venv && .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app:app --port 8000

# 2) API server (port 4000)
cd webapp/server
npm install && npx prisma db push && npm run seed && npm run dev

# 3) Web interface (port 5173)
cd webapp/client
npm install && npm run dev
```

See `webapp/README.md` for full setup and details.
