// Command ulocsa is the client for the ulocsa API (https://ulocsa.michill.ru),
// the paid translation mode of the ulocsa skill. It keeps the project id in
// .ulocsa/project.json so every run lands in the same project.
//
//	ulocsa init --name krillion --platforms web
//	ulocsa context --brief-file .ulocsa/brief.md --register polite --keep Sandallion,Telegram
//	ulocsa glossary --file .ulocsa/glossary.json
//	ulocsa sync --source ui/locales/ru.json --meta .ulocsa/meta.json [--full]
//	ulocsa estimate [--no-review]
//	ulocsa translate [--max-rub 50] [--wait]
//	ulocsa pull --out ui/locales/sah.json [--format json|nested|arb|android|po|xcstrings]
//	ulocsa status | balance | report | review-sheet --out review.csv
//	ulocsa feedback <key> "<correct text>" --why "<reason>"
//
// Environment: ULOCSA_TOKEN (required), ULOCSA_URL.
package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const stateDir = ".ulocsa"

type state struct {
	ProjectID string `json:"project_id"`
	Name      string `json:"name"`
	URL       string `json:"url,omitempty"`
	QuoteID   string `json:"quote_id,omitempty"`
	JobID     string `json:"job_id,omitempty"`
}

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	cmd, args := os.Args[1], os.Args[2:]
	var err error
	switch cmd {
	case "init":
		err = cmdInit(args)
	case "context":
		err = cmdContext(args)
	case "glossary":
		err = cmdGlossary(args)
	case "sync":
		err = cmdSync(args)
	case "estimate":
		err = cmdEstimate(args)
	case "translate":
		err = cmdTranslate(args)
	case "pull":
		err = cmdPull(args)
	case "status":
		err = cmdStatus()
	case "balance":
		err = cmdBalance()
	case "report":
		err = cmdReport(args)
	case "review-sheet":
		err = cmdReviewSheet(args)
	case "feedback":
		err = cmdFeedback(args)
	default:
		usage()
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "ulocsa:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: ulocsa init|context|glossary|sync|estimate|translate|pull|status|balance|report|review-sheet|feedback …")
	os.Exit(2)
}

// --- HTTP ---

func baseURL(st *state) string {
	if u := os.Getenv("ULOCSA_URL"); u != "" {
		return strings.TrimRight(u, "/")
	}
	if st != nil && st.URL != "" {
		return st.URL
	}
	return "https://ulocsa.michill.ru"
}

type apiError struct {
	Status int
	Msg    string
	Body   []byte
}

func (e *apiError) Error() string { return fmt.Sprintf("HTTP %d: %s", e.Status, e.Msg) }

func call(st *state, method, path string, body, out any) error {
	token := os.Getenv("ULOCSA_TOKEN")
	if token == "" {
		return errors.New("ULOCSA_TOKEN is not set: sign up at https://ulocsa.michill.ru, create a key in the cabinet and export it (never commit it)")
	}
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, baseURL(st)+path, rd)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Api-Key "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 2 * time.Minute}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode/100 != 2 {
		var e struct{ Error string }
		json.Unmarshal(data, &e)
		if e.Error == "" {
			e.Error = strings.TrimSpace(string(data))
		}
		return &apiError{resp.StatusCode, e.Error, data}
	}
	switch o := out.(type) {
	case nil:
		return nil
	case *[]byte:
		*o = data
		return nil
	default:
		return json.Unmarshal(data, out)
	}
}

// --- state ---

func load() (*state, error) {
	b, err := os.ReadFile(filepath.Join(stateDir, "project.json"))
	if errors.Is(err, os.ErrNotExist) {
		return nil, errors.New("no .ulocsa/project.json here: run ulocsa init first")
	}
	if err != nil {
		return nil, err
	}
	var st state
	return &st, json.Unmarshal(b, &st)
}

func save(st *state) error {
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(st, "", "  ")
	return os.WriteFile(filepath.Join(stateDir, "project.json"), append(b, '\n'), 0o644)
}

func pp(st *state, rest string) string { return "/l10n/v1/projects/" + st.ProjectID + rest }

func printJSON(v any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	enc.Encode(v)
}

// --- commands ---

func cmdInit(args []string) error {
	fs := flag.NewFlagSet("init", flag.ExitOnError)
	name := fs.String("name", "", "project name (default: directory name)")
	platforms := fs.String("platforms", "", "comma-separated: web,android,ios,flutter,rn,backend")
	source := fs.String("source-locale", "ru", "source locale")
	fs.Parse(args)
	if *name == "" {
		wd, _ := os.Getwd()
		*name = filepath.Base(wd)
	}
	var ps []string
	for _, p := range strings.Split(*platforms, ",") {
		if p = strings.TrimSpace(p); p != "" {
			ps = append(ps, p)
		}
	}
	var p struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := call(nil, "POST", "/l10n/v1/projects", map[string]any{"name": *name, "source_locale": *source, "platforms": ps}, &p); err != nil {
		return err
	}
	st := &state{ProjectID: p.ID, Name: p.Name}
	if u := os.Getenv("ULOCSA_URL"); u != "" {
		st.URL = strings.TrimRight(u, "/")
	}
	if err := save(st); err != nil {
		return err
	}
	fmt.Printf("project %s (%s) → .ulocsa/project.json\n", p.Name, p.ID)
	return nil
}

func cmdContext(args []string) error {
	fs := flag.NewFlagSet("context", flag.ExitOnError)
	briefFile := fs.String("brief-file", ".ulocsa/brief.md", "what the product is, audience, tone")
	register := fs.String("register", "polite", "polite (эһиги) | familiar (эн)")
	keep := fs.String("keep", "", "comma-separated names that stay as they are")
	fs.Parse(args)
	st, err := load()
	if err != nil {
		return err
	}
	brief, err := os.ReadFile(*briefFile)
	if err != nil {
		return err
	}
	var ks []string
	for _, k := range strings.Split(*keep, ",") {
		if k = strings.TrimSpace(k); k != "" {
			ks = append(ks, k)
		}
	}
	if err := call(st, "PUT", pp(st, "/context"), map[string]any{"brief": string(brief), "register": *register, "keep": ks}, nil); err != nil {
		return err
	}
	fmt.Println("context saved")
	return nil
}

func cmdGlossary(args []string) error {
	fs := flag.NewFlagSet("glossary", flag.ExitOnError)
	file := fs.String("file", ".ulocsa/glossary.json", `[{"source": "заказ", "target": "сакаас"}, {"source": "Drivee", "policy": "keep"}]`)
	fs.Parse(args)
	st, err := load()
	if err != nil {
		return err
	}
	b, err := os.ReadFile(*file)
	if err != nil {
		return err
	}
	var terms []map[string]any
	if err := json.Unmarshal(b, &terms); err != nil {
		return fmt.Errorf("%s: %w", *file, err)
	}
	if err := call(st, "PUT", pp(st, "/glossary"), map[string]any{"terms": terms}, nil); err != nil {
		return err
	}
	fmt.Printf("%d terms saved\n", len(terms))
	return nil
}

type sourceString struct {
	Key      string `json:"key"`
	Text     string `json:"text"`
	Role     string `json:"role,omitempty"`
	Desc     string `json:"desc,omitempty"`
	Screen   string `json:"screen,omitempty"`
	MaxChars int    `json:"max_chars,omitempty"`
}

// flatten turns nested i18next/vue-i18n JSON into dotted keys.
func flatten(prefix string, v any, out map[string]string) error {
	switch t := v.(type) {
	case string:
		out[prefix] = t
	case map[string]any:
		for k, child := range t {
			key := k
			if prefix != "" {
				key = prefix + "." + k
			}
			if err := flatten(key, child, out); err != nil {
				return err
			}
		}
	default:
		return fmt.Errorf("key %q: unsupported value %T (only strings and objects)", prefix, v)
	}
	return nil
}

func cmdSync(args []string) error {
	fs := flag.NewFlagSet("sync", flag.ExitOnError)
	source := fs.String("source", "", "source locale file: flat or nested JSON (key → text)")
	strs := fs.String("strings", "", "or: a JSON array of {key, text, role, desc, screen, max_chars}")
	meta := fs.String("meta", ".ulocsa/meta.json", "context per key: {key: {role, desc, screen, max_chars}}")
	full := fs.Bool("full", true, "the file is the whole source: keys missing from it are deleted")
	fs.Parse(args)
	st, err := load()
	if err != nil {
		return err
	}
	var list []sourceString
	switch {
	case *strs != "":
		b, err := os.ReadFile(*strs)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(b, &list); err != nil {
			return fmt.Errorf("%s: %w", *strs, err)
		}
	case *source != "":
		b, err := os.ReadFile(*source)
		if err != nil {
			return err
		}
		var v any
		if err := json.Unmarshal(b, &v); err != nil {
			return fmt.Errorf("%s: %w", *source, err)
		}
		flat := map[string]string{}
		if err := flatten("", v, flat); err != nil {
			return err
		}
		metas := map[string]sourceString{}
		if b, err := os.ReadFile(*meta); err == nil {
			if err := json.Unmarshal(b, &metas); err != nil {
				return fmt.Errorf("%s: %w", *meta, err)
			}
		}
		keys := make([]string, 0, len(flat))
		for k := range flat {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		missing := 0
		for _, k := range keys {
			m := metas[k]
			if m.Desc == "" && m.Role == "" {
				missing++
			}
			list = append(list, sourceString{Key: k, Text: flat[k], Role: m.Role, Desc: m.Desc, Screen: m.Screen, MaxChars: m.MaxChars})
		}
		if missing > 0 {
			fmt.Fprintf(os.Stderr, "note: %d of %d keys have no role/desc in %s; context improves translation\n", missing, len(keys), *meta)
		}
	default:
		return errors.New("give --source <locale file> or --strings <array file>")
	}
	var res struct {
		Sync  map[string]int `json:"sync"`
		Stats map[string]int `json:"stats"`
	}
	if err := call(st, "POST", pp(st, "/strings"), map[string]any{"strings": list, "full": *full}, &res); err != nil {
		return err
	}
	fmt.Printf("synced %d strings: %d added, %d changed, %d unchanged, %d deleted; %d need translation\n",
		len(list), res.Sync["added"], res.Sync["changed"], res.Sync["unchanged"], res.Sync["deleted"], res.Stats["pending"])
	return nil
}

func cmdEstimate(args []string) error {
	fs := flag.NewFlagSet("estimate", flag.ExitOnError)
	noReview := fs.Bool("no-review", false, "skip the review pass (cheaper, worse)")
	fs.Parse(args)
	st, err := load()
	if err != nil {
		return err
	}
	review := !*noReview
	var res struct {
		Quote struct {
			ID         string    `json:"id"`
			Strings    int       `json:"strings"`
			TokensIn   int       `json:"tokens_in"`
			TokensOut  int       `json:"tokens_out"`
			ValidUntil time.Time `json:"valid_until"`
		} `json:"quote"`
		Batches   int    `json:"batches"`
		OutP90    int    `json:"tokens_out_p90"`
		P50       string `json:"rub_p50"`
		P90       string `json:"rub_p90"`
		Available string `json:"available_rub"`
		Enough    bool   `json:"enough"`
	}
	if err := call(st, "POST", pp(st, "/estimate"), map[string]any{"review": review}, &res); err != nil {
		return err
	}
	st.QuoteID = res.Quote.ID
	if err := save(st); err != nil {
		return err
	}
	q := res.Quote
	fmt.Printf("strings to translate: %d (%d batches, review: %v)\n", q.Strings, res.Batches, review)
	fmt.Printf("tokens: %d in, %d–%d out\n", q.TokensIn, q.TokensOut, res.OutP90)
	fmt.Printf("cost: ~%s ₽ (up to %s ₽)\n", res.P50, res.P90)
	fmt.Printf("available: %s ₽%s\n", res.Available, map[bool]string{false: "  ← NOT ENOUGH", true: ""}[res.Enough])
	fmt.Printf("quote %s valid until %s\n", q.ID, q.ValidUntil.Local().Format("15:04"))
	return nil
}

type jobView struct {
	Job struct {
		ID     string `json:"id"`
		Status string `json:"status"`
		Total  int    `json:"total"`
		Done   int    `json:"done"`
		Error  string `json:"error"`
	} `json:"job"`
	Spent string `json:"spent_rub"`
	Max   string `json:"max_rub"`
}

func cmdTranslate(args []string) error {
	fs := flag.NewFlagSet("translate", flag.ExitOnError)
	quote := fs.String("quote", "", "quote id (default: the last estimate)")
	maxRub := fs.Float64("max-rub", 0, "spending cap in rubles (default: the quote's upper bound)")
	wait := fs.Bool("wait", true, "wait for the job and show progress")
	fs.Parse(args)
	st, err := load()
	if err != nil {
		return err
	}
	if *quote == "" {
		*quote = st.QuoteID
	}
	if *quote == "" {
		return errors.New("no quote: run ulocsa estimate first")
	}
	var jv jobView
	if err := call(st, "POST", pp(st, "/jobs"), map[string]any{"quote_id": *quote, "max_rub": *maxRub}, &jv); err != nil {
		return err
	}
	st.JobID = jv.Job.ID
	if err := save(st); err != nil {
		return err
	}
	fmt.Printf("job %s: %d strings, cap %s ₽\n", jv.Job.ID, jv.Job.Total, jv.Max)
	if !*wait {
		return nil
	}
	last := ""
	for {
		time.Sleep(5 * time.Second)
		if err := call(st, "GET", "/l10n/v1/jobs/"+st.JobID, nil, &jv); err != nil {
			return err
		}
		if line := fmt.Sprintf("  %s: %d/%d, spent %s ₽", jv.Job.Status, jv.Job.Done, jv.Job.Total, jv.Spent); line != last {
			fmt.Println(line)
			last = line
		}
		switch jv.Job.Status {
		case "done":
			fmt.Printf("done: %d strings, %s ₽\n", jv.Job.Done, jv.Spent)
			return nil
		case "stopped", "failed":
			return fmt.Errorf("job %s: %s", jv.Job.Status, jv.Job.Error)
		}
	}
}

func cmdPull(args []string) error {
	fs := flag.NewFlagSet("pull", flag.ExitOnError)
	out := fs.String("out", "", "file to write (default: stdout)")
	format := fs.String("format", "json", "json|nested|arb|android|po|xcstrings")
	fs.Parse(args)
	st, err := load()
	if err != nil {
		return err
	}
	var body []byte
	if err := call(st, "GET", pp(st, "/translations?format="+*format), nil, &body); err != nil {
		return err
	}
	if *out == "" {
		_, err := os.Stdout.Write(body)
		return err
	}
	if err := os.MkdirAll(filepath.Dir(*out), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(*out, body, 0o644); err != nil {
		return err
	}
	fmt.Printf("wrote %s\n", *out)
	return nil
}

func cmdStatus() error {
	st, err := load()
	if err != nil {
		return err
	}
	var v any
	if err := call(st, "GET", pp(st, ""), nil, &v); err != nil {
		return err
	}
	printJSON(v)
	return nil
}

func cmdBalance() error {
	var v map[string]any
	if err := call(nil, "GET", "/l10n/v1/account", nil, &v); err != nil {
		return err
	}
	fmt.Printf("balance %v ₽, available %v ₽ (held %v ₽), key %v\n", v["balance_rub"], v["available_rub"], v["held_rub"], v["key"])
	return nil
}

type fullTranslation struct {
	Key      string `json:"key"`
	Text     string `json:"text"`
	Source   string `json:"source"`
	Flag     string `json:"flag"`
	Note     string `json:"note"`
	Status   string `json:"status"`
	Stale    bool   `json:"stale"`
	Problems []struct {
		Code     string
		Severity string
		Detail   string
	} `json:"problems"`
}

func fetchFull(st *state) ([]fullTranslation, error) {
	var res struct {
		Translations []fullTranslation `json:"translations"`
	}
	err := call(st, "GET", pp(st, "/translations?format=full"), nil, &res)
	return res.Translations, err
}

// report lists what needs a human or a code change: fragments to refactor,
// ambiguous strings to describe, and strings the validator still flags.
func cmdReport(args []string) error {
	st, err := load()
	if err != nil {
		return err
	}
	ts, err := fetchFull(st)
	if err != nil {
		return err
	}
	var frag, amb, errs, warns []string
	for _, t := range ts {
		line := fmt.Sprintf("  %s: %q → %q", t.Key, t.Source, t.Text)
		if t.Note != "" {
			line += "\n      " + t.Note
		}
		switch t.Flag {
		case "fragment":
			frag = append(frag, line)
		case "ambiguous":
			amb = append(amb, line)
		}
		for _, p := range t.Problems {
			l := fmt.Sprintf("  %s: %s %s (%q)", t.Key, p.Code, p.Detail, t.Text)
			if p.Severity == "error" {
				errs = append(errs, l)
			} else {
				warns = append(warns, l)
			}
		}
	}
	section := func(title string, xs []string) {
		if len(xs) == 0 {
			return
		}
		fmt.Printf("\n%s (%d):\n%s\n", title, len(xs), strings.Join(xs, "\n"))
	}
	fmt.Printf("%d translations\n", len(ts))
	section("FRAGMENTS — glued in code, refactor into whole messages", frag)
	section("AMBIGUOUS — add a desc and retranslate", amb)
	section("ERRORS — still failing checks", errs)
	section("WARNINGS", warns)
	return nil
}

func cmdReviewSheet(args []string) error {
	fs := flag.NewFlagSet("review-sheet", flag.ExitOnError)
	out := fs.String("out", "ulocsa-review.csv", "CSV for the native-speaker reviewer")
	fs.Parse(args)
	st, err := load()
	if err != nil {
		return err
	}
	ts, err := fetchFull(st)
	if err != nil {
		return err
	}
	f, err := os.Create(*out)
	if err != nil {
		return err
	}
	defer f.Close()
	f.WriteString("\xef\xbb\xbf")
	w := csv.NewWriter(f)
	w.Write([]string{"key", "source", "translation", "status", "flag", "note", "score_1_5", "correct_translation", "comment"})
	for _, t := range ts {
		w.Write([]string{t.Key, t.Source, t.Text, t.Status, t.Flag, t.Note, "", "", ""})
	}
	w.Flush()
	fmt.Printf("wrote %s (%d rows). Corrections go back with: ulocsa feedback <key> \"<text>\" --why \"…\"\n", *out, len(ts))
	return w.Error()
}

func cmdFeedback(args []string) error {
	fs := flag.NewFlagSet("feedback", flag.ExitOnError)
	why := fs.String("why", "", "why the correction is right")
	if len(args) < 2 {
		return errors.New(`usage: ulocsa feedback <key> "<correct text>" --why "<reason>"`)
	}
	key, text := args[0], args[1]
	fs.Parse(args[2:])
	st, err := load()
	if err != nil {
		return err
	}
	var res map[string]any
	if err := call(st, "POST", pp(st, "/feedback"), map[string]any{"key": key, "text": text, "why": *why}, &res); err != nil {
		var ae *apiError
		if errors.As(err, &ae) && ae.Status == http.StatusUnprocessableEntity {
			fmt.Fprintln(os.Stderr, string(ae.Body))
		}
		return err
	}
	fmt.Println("saved as the human translation of", key)
	return nil
}
