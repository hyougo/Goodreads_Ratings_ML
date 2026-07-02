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

